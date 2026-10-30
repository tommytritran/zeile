import { describe, expect, it } from 'vitest';
import { compareSources, extract } from '../src/analyze';
import { parseChangedFiles, resolveCommit } from '../src/git';
import { validCanvas, emptyCanvas } from '../src/model';

const source = (files: Record<string, string>) => new Map(Object.entries(files));
describe('snapshot analysis', () => {
  it('does not invent deleted and added callbacks after a line insertion', () => {
    const code = 'describe("suite", () => {\n it("existing", () => { const helper = () => 1; return helper(); });\n});';
    const result = compareSources(source({ 'a.test.ts': code }), source({ 'a.test.ts': '// new comment\n' + code }), [{ path: 'a.test.ts', status: 'M', represented: false }]);
    expect(result.nodes.filter(node => node.kind === 'function' && node.status !== 'context')).toHaveLength(0);
    expect(result.nodes.find(node => node.kind === 'module')).toBeDefined();
  });
  it('keeps existing named test callbacks stable when a preceding test is added', () => {
    const before = 'describe("suite", () => { it("existing", () => 1); });';
    const after = 'describe("suite", () => { it("new", () => 2); it("existing", () => 1); });';
    const result = compareSources(source({ 'a.test.ts': before }), source({ 'a.test.ts': after }), [{ path: 'a.test.ts', status: 'M', represented: false }]);
    expect(result.nodes.filter(node => node.status === 'removed')).toHaveLength(0);
    expect(result.nodes.filter(node => node.status === 'added')).toHaveLength(1);
  });
  it('does not treat incomplete snapshot coverage as deleted source', () => {
    const result = compareSources(source({ 'a.ts': 'function a() { return 1; }', 'untouched.ts': 'function context() {}' }), source({}), [{ path: 'a.ts', status: 'M', represented: false }]);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.every(node => node.status === 'context')).toBe(true);
    expect(result.files[0].represented).toBe(false);
  });
  it('resolves imported functions and includes unchanged callers', () => {
    const before = source({ 'src/main.ts': 'import { charge } from "./pay"; export function submit() { return charge(2); }', 'src/pay.ts': 'export function charge(x: number) { return x; }' });
    const after = new Map(before); after.set('src/pay.ts', 'export function charge(x: number) { return x + 1; }');
    const result = compareSources(before, after, [{ path: 'src/pay.ts', status: 'M', represented: false }]);
    expect(result.nodes.find(n => n.name === 'submit')?.status).toBe('context');
    expect(result.nodes.find(n => n.name === 'charge')?.status).toBe('modified');
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].revision).toBe('both');
  });
  it('extracts arrows and methods, without inventing interface dispatch', () => {
    const result = extract(source({ 'app.ts': 'interface Gateway { pay(): number }; class Stripe { pay() { return 1; } }; const run = (g: Gateway) => g.pay();' }));
    expect([...result.functions.values()].map(n => n.name)).toEqual(['Stripe.pay', 'run']);
    expect(result.calls).toHaveLength(0);
    expect(result.unresolved).toBe(1);
  });
  it('preserves renamed source paths and deleted functions', () => {
    const result = compareSources(source({ 'old.ts': 'export function keep() { return 1; }\nexport function gone() { return 2; }' }), source({ 'new.ts': 'export function keep() { return 1; }' }), [{ path: 'new.ts', oldPath: 'old.ts', status: 'R75', represented: false }]);
    const keep = result.nodes.find(n => n.name === 'keep');
    expect(keep?.before?.path).toBe('old.ts');
    expect(keep?.after?.path).toBe('new.ts');
    expect(result.nodes.find(n => n.name === 'gone')?.status).toBe('removed');
  });
  it('represents top-level changes and inventories non-code files', () => {
    const result = compareSources(source({ 'app.ts': 'const mode = 1; function same() { return 1; }' }), source({ 'app.ts': 'const mode = 2; function same() { return 1; }' }), [{ path: 'app.ts', status: 'M', represented: false }, { path: 'README.md', status: 'M', represented: false }]);
    expect(result.nodes.some(n => n.kind === 'module')).toBe(true);
    expect(result.files.find(f => f.path === 'README.md')?.represented).toBe(false);
  });
  it('keeps added and removed call relationships separate', () => {
    const result = compareSources(source({ 'a.ts': 'function a() { b(); } function b() {} function c() {}' }), source({ 'a.ts': 'function a() { c(); } function b() {} function c() {}' }), [{ path: 'a.ts', status: 'M', represented: false }]);
    expect(result.edges.map(e => e.revision).sort()).toEqual(['after', 'before']);
  });
  it('parses NUL-delimited renames and filenames with spaces', () => {
    expect(parseChangedFiles('R100\0old file.ts\0new file.ts\0M\0README.md\0')).toEqual([{ oldPath: 'old file.ts', path: 'new file.ts', status: 'R100', represented: false }, { path: 'README.md', status: 'M', represented: false }]);
  });
  it('does not mark repeated calls from only one revision as both', () => {
    const result = compareSources(source({ 'a.ts': 'function a() { b(); b(); } function b() {}' }), source({ 'a.ts': 'function a() {} function b() {}' }), [{ path: 'a.ts', status: 'M', represented: false }]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].revision).toBe('before');
  });
  it('validates persisted canvas data', () => {
    expect(validCanvas(emptyCanvas())).toBe(true);
    expect(validCanvas({ ...emptyCanvas(), positions: { bad: { x: Infinity, y: 0 } } })).toBe(false);
    expect(validCanvas({ ...emptyCanvas(), manualEdges: [{ id: 7 }] })).toBe(false);
  });
  it('retains the full A to B to C context chain and disconnected indexed functions', () => {
    const before = source({ 'a.ts': 'function A() { return B(); }\nfunction B() { return C(); }\nfunction C() { return 1; }\nfunction unrelated() {}' });
    const after = new Map(before); after.set('a.ts', before.get('a.ts')!.replace('return B()', 'return B() + 1'));
    const result = compareSources(before, after, [{ path: 'a.ts', status: 'M', represented: false }]);
    expect(result.nodes.map(node => node.name)).toEqual(['A', 'B', 'C', 'unrelated']);
    expect(result.edges.map(edge => [edge.source, edge.target])).toEqual([['a.ts::A', 'a.ts::B'], ['a.ts::B', 'a.ts::C']]);
    expect(result.edges.every(edge => result.nodes.some(node => node.id === edge.source) && result.nodes.some(node => node.id === edge.target))).toBe(true);
  });
  it('uses lexical AST ownership for duplicate callback names and nested declarations', () => {
    const code = 'function outer() {\n consume(() => { const child = () => 1; });\n consume(() => { const child = () => 2; });\n}\nfunction top() {}';
    const result = compareSources(source({ 'a.ts': code }), source({ 'a.ts': code }), []);
    const callbacks = result.nodes.filter(node => node.name.endsWith('callback') || node.name.endsWith('callback #2'));
    expect(callbacks).toHaveLength(2);
    expect(callbacks.every(node => node.parentId === 'a.ts::outer')).toBe(true);
    const children = result.nodes.filter(node => node.name.includes('.child'));
    expect(children.map(node => node.parentId)).toEqual(callbacks.map(node => node.id));
    expect(result.nodes.find(node => node.name === 'top')?.parentId).toBeUndefined();
    expect(result.nodes.find(node => node.name === 'outer')?.after).toMatchObject({ line: 1, endLine: 4 });
  });
  it('records all call-site revision paths and lines, including repeated calls and renames', () => {
    const result = compareSources(source({ 'old.ts': 'function a() {\n b();\n b();\n}\nfunction b() {}' }), source({ 'new.ts': 'function a() {\n\n b();\n}\nfunction b() {}' }), [{ path: 'new.ts', oldPath: 'old.ts', status: 'R80', represented: false }]);
    expect(result.edges[0]).toMatchObject({ source: 'new.ts::a', target: 'new.ts::b', revision: 'both', sites: [
      { revision: 'before', path: 'old.ts', line: 2 }, { revision: 'before', path: 'old.ts', line: 3 }, { revision: 'after', path: 'new.ts', line: 3 }
    ] });
  });
  it('does not mark a changed inventory item represented merely because context functions exist', () => {
    const code = 'function unchanged() { return 1; }';
    const result = compareSources(source({ 'a.ts': code }), source({ 'a.ts': code }), [{ path: 'a.ts', status: 'M', represented: true }]);
    expect(result.nodes).toHaveLength(1);
    expect(result.files[0].represented).toBe(false);
    const renamed = compareSources(source({ 'old.ts': code }), source({ 'new.ts': code }), [{ path: 'new.ts', oldPath: 'old.ts', status: 'R100', represented: false }]);
    expect(renamed.files[0].represented).toBe(true);
  });
  it('rejects empty Git revisions before spawning Git', async () => {
    await expect(resolveCommit('.', '')).rejects.toThrow('valid Git revision');
  });
});
