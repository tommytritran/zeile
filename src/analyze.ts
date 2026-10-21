import ts from 'typescript';
import { posix } from 'node:path';
import type { ChangedFile, ReviewEdge, ReviewGraph, ReviewNode, SourceVersion } from './model';
import { changedFiles, readSnapshot, resolveCommit } from './git';

interface Extracted { key: string; path: string; name: string; source: SourceVersion; ast: ts.FunctionLikeDeclaration }
interface Extraction { functions: Map<string, Extracted>; calls: { source: string; target: string; kind: ReviewEdge['kind'] }[]; unresolved: number; warnings: string[] }
const sourcePattern = /\.[cm]?[jt]sx?$/;
function isFunction(node: ts.Node): node is ts.FunctionLikeDeclaration {
  return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isConstructorDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node);
}
function declarationName(node: ts.FunctionLikeDeclaration, file: ts.SourceFile): string {
  if (ts.isConstructorDeclaration(node)) return 'constructor';
  if (node.name) return node.name.getText(file);
  const parent = node.parent;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return parent.name.getText(file);
  if (ts.isExportAssignment(parent)) return 'default';
  if (ts.isFunctionDeclaration(node)) return 'default';
  return `callback@${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`;
}
function keyFor(node: ts.FunctionLikeDeclaration, file: ts.SourceFile): string {
  const names = [declarationName(node, file)];
  let ancestor = node.parent;
  while (ancestor && !ts.isSourceFile(ancestor)) {
    if (isFunction(ancestor)) names.unshift(declarationName(ancestor, file));
    else if ((ts.isClassDeclaration(ancestor) || ts.isClassExpression(ancestor)) && ancestor.name) names.unshift(ancestor.name.text);
    ancestor = ancestor.parent;
  }
  return `${file.fileName}::${names.join('.')}`;
}

export function extract(sources: Map<string, string>): Extraction {
  const root = '/zeile-snapshot/';
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    allowJs: true, jsx: ts.JsxEmit.Preserve, noLib: true, noResolve: false, skipLibCheck: true
  };
  const warnings: string[] = [];
  const configPath = sources.has('tsconfig.json') ? 'tsconfig.json' : sources.has('jsconfig.json') ? 'jsconfig.json' : undefined;
  if (configPath) {
    const parsed = ts.parseConfigFileTextToJson(configPath, sources.get(configPath)!);
    if (parsed.error) warnings.push('Could not parse root TypeScript configuration; using default module resolution.');
    else {
      const converted = ts.convertCompilerOptionsFromJson(parsed.config.compilerOptions ?? {}, root);
      Object.assign(options, converted.options, { noLib: true, allowJs: true });
      if (parsed.config.extends || parsed.config.references) warnings.push('Extended tsconfig files and project references are not resolved in this MVP.');
      if (converted.errors.length) warnings.push('Some TypeScript compiler options could not be interpreted.');
    }
  }
  const absolute = new Map([...sources].map(([path, code]) => [root + path, code]));
  const sourceFiles = new Map<string, ts.SourceFile>();
  const host: ts.CompilerHost = {
    getSourceFile(path, languageVersion) {
      const content = absolute.get(path);
      if (content === undefined) return undefined;
      let source = sourceFiles.get(path);
      if (!source) { source = ts.createSourceFile(path, content, languageVersion, true); sourceFiles.set(path, source); }
      return source;
    },
    getDefaultLibFileName: () => '', writeFile: () => undefined, getCurrentDirectory: () => root,
    getDirectories: () => [], fileExists: path => absolute.has(path), readFile: path => absolute.get(path),
    directoryExists: dir => [...absolute.keys()].some(path => path.startsWith(dir.endsWith('/') ? dir : dir + '/')),
    getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'
  };
  const program = ts.createProgram([...absolute.keys()].filter(path => sourcePattern.test(path)), options, host);
  const checker = program.getTypeChecker();
  const functions = new Map<string, Extracted>();
  const astKeys = new Map<ts.Node, string>();
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const relativePath = file.fileName.slice(root.length);
    const visit = (node: ts.Node) => {
      if (isFunction(node) && node.body) {
        const rawKey = keyFor(node, file).replace(root, '');
        let key = rawKey;
        if (functions.has(key)) key = `${rawKey}@${node.getStart(file)}`;
        const name = key.slice(key.indexOf('::') + 2);
        const params = node.parameters.map(p => p.getText(file)).join(', ');
        const signature = checker.getSignatureFromDeclaration(node);
        const output = node.type?.getText(file) ?? (signature ? checker.typeToString(checker.getReturnTypeOfSignature(signature)) : 'unknown');
        functions.set(key, { key, path: relativePath, name, ast: node, source: {
          path: relativePath, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          code: node.getText(file), signature: `(${params}) → ${output}`
        } });
        astKeys.set(node, key);
        if (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent) || ts.isPropertyDeclaration(node.parent)) astKeys.set(node.parent, key);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  const calls: Extraction['calls'] = [];
  let unresolved = 0;
  for (const fn of functions.values()) {
    const visit = (node: ts.Node) => {
      if (node !== fn.ast && isFunction(node)) return;
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const signature = checker.getResolvedSignature(node);
        let target = signature?.declaration ? astKeys.get(signature.declaration) : undefined;
        if (!target) {
          let symbol = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(node.expression) ? node.expression.name : node.expression);
          if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
          target = symbol?.declarations?.map(d => astKeys.get(d)).find(Boolean);
        }
        if (target) calls.push({ source: fn.key, target, kind: ts.isPropertyAccessExpression(node.expression) ? 'declaration' : 'resolved' });
        else unresolved++;
      }
      ts.forEachChild(node, visit);
    };
    visit(fn.ast);
  }
  return { functions, calls, unresolved, warnings };
}

export function compareSources(before: Map<string, string>, after: Map<string, string>, files: ChangedFile[]): Pick<ReviewGraph, 'nodes' | 'edges' | 'warnings' | 'unresolvedCalls' | 'files'> {
  const old = extract(before), next = extract(after);
  const rename = new Map(files.filter(f => f.oldPath).map(f => [f.oldPath!, f.path]));
  const canonical = (key: string) => {
    const split = key.indexOf('::');
    return `${rename.get(key.slice(0, split)) ?? key.slice(0, split)}${key.slice(split)}`;
  };
  const oldFunctions = new Map([...old.functions].map(([key, fn]) => [canonical(key), fn]));
  const all = new Map<string, ReviewNode>();
  const changed = new Set<string>();
  for (const key of new Set([...oldFunctions.keys(), ...next.functions.keys()])) {
    const previous = oldFunctions.get(key), current = next.functions.get(key);
    const status = !previous ? 'added' : !current ? 'removed' : previous.source.code !== current.source.code ? 'modified' : 'context';
    all.set(key, { id: key, file: current?.path ?? rename.get(previous!.path) ?? previous!.path, name: current?.name ?? previous!.name,
      kind: 'function', status, before: previous?.source, after: current?.source });
    if (status !== 'context' || (previous && current && previous.path !== current.path)) changed.add(key);
  }
  const edgeMap = new Map<string, ReviewEdge>();
  for (const [revision, result] of [['before', old], ['after', next]] as const) {
    for (const call of result.calls) {
      const source = revision === 'before' ? canonical(call.source) : call.source;
      const target = revision === 'before' ? canonical(call.target) : call.target;
      const id = `${source}=>${target}`;
      const existing = edgeMap.get(id);
      if (existing && existing.revision !== revision) existing.revision = 'both';
      else edgeMap.set(id, { id, source, target, revision, kind: call.kind,
        label: call.kind === 'declaration' ? 'method declaration' : 'source reference' });
    }
  }
  const visible = new Set(changed);
  for (const edge of edgeMap.values()) if (changed.has(edge.source) || changed.has(edge.target)) { visible.add(edge.source); visible.add(edge.target); }
  const nodes = [...visible].map(key => all.get(key)!).filter(Boolean);
  const inventory = files.map(f => ({ ...f }));
  for (const file of inventory) {
    if (!sourcePattern.test(file.path) && !(file.oldPath && sourcePattern.test(file.oldPath))) continue;
    const oldCode = before.get(file.oldPath ?? file.path), newCode = after.get(file.path);
    const residual = (text: string | undefined, extraction: Extraction, path: string) => {
      if (text === undefined) return undefined;
      const candidates = [...extraction.functions.values()].filter(fn => fn.path === path).map(fn => [fn.ast.getStart(), fn.ast.getEnd()] as const);
      const ranges = candidates.filter(([start, end]) => !candidates.some(([outerStart, outerEnd]) => outerStart < start && outerEnd >= end)).sort((a, b) => b[0] - a[0]);
      let value = text;
      for (const [start, end] of ranges) value = value.slice(0, start) + value.slice(end);
      return value;
    };
    if (residual(oldCode, old, file.oldPath ?? file.path) !== residual(newCode, next, file.path)) {
      nodes.push({ id: `${file.path}::#module`, file: file.path, name: 'File / module context', kind: 'module',
        status: oldCode === undefined ? 'added' : newCode === undefined ? 'removed' : 'modified',
        before: oldCode === undefined ? undefined : { path: file.oldPath ?? file.path, line: 1, code: oldCode, signature: 'Full file · includes imports and top-level code' },
        after: newCode === undefined ? undefined : { path: file.path, line: 1, code: newCode, signature: 'Full file · includes imports and top-level code' } });
    }
    file.represented = nodes.some(node => node.file === file.path);
  }
  const warnings = [...new Set([...old.warnings, ...next.warnings])];
  warnings.push('Best-effort source relationships, not runtime calls. Method edges identify declarations, not guaranteed dispatch targets. DI, events, callbacks and external dependencies may be unresolved.');
  warnings.push('Analysis reads tracked source only; dependency packages, standard library types and generated declarations are not loaded. Inferred signatures may be incomplete.');
  return { nodes, edges: [...edgeMap.values()].filter(e => visible.has(e.source) && visible.has(e.target)), files: inventory, warnings, unresolvedCalls: next.unresolved };
}

export async function analyzeRepository(repo: string, baseLabel: string, headLabel: string): Promise<ReviewGraph> {
  const [base, head] = await Promise.all([resolveCommit(repo, baseLabel), resolveCommit(repo, headLabel)]);
  const [old, next, files] = await Promise.all([readSnapshot(repo, base), readSnapshot(repo, head), changedFiles(repo, base, head)]);
  const result = compareSources(old.sources, next.sources, files);
  return { repository: posix.basename(repo), base, head, baseLabel, headLabel, ...result,
    warnings: [...result.warnings, ...old.warnings, ...next.warnings] };
}
