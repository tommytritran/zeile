import { describe, expect, it } from 'vitest';
import { compareSources, extract } from '../src/analyze';
import { parseChangedFiles, resolveCommit } from '../src/git';
import { validCanvas, emptyCanvas } from '../src/model';

const source = (files: Record<string, string>) => new Map(Object.entries(files));
describe('snapshot analysis', () => {
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
  it('rejects empty Git revisions before spawning Git', async () => {
    await expect(resolveCommit('.', '')).rejects.toThrow('valid Git revision');
  });
});
