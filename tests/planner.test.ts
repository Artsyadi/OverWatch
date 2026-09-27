import { describe, expect, it } from 'vitest';
import type OpenAI from 'openai';
import { plan } from '../server/planner';
import { rulesPlan } from '../shared/engine';
import { seed } from '../shared/seed';
const mock = (parse: () => Promise<unknown>) => ({ responses: { parse } } as unknown as OpenAI);
describe('AI planner boundary', () => {
    it('labels the no-key planner and does not mutate state', async () => { const s = seed(), before = structuredClone(s); const reply = await plan(s, 'Fulfill 1042', null, { model: 'gpt-5-mini' }); expect(reply.mode).toBe('rules'); expect(reply.proposal?.note).toMatch(/not configured/); expect(s).toEqual(before); });
    it('uses a validated live proposal', async () => { const s = seed(), p = rulesPlan(s, 'Fulfill 1042')!; const reply = await plan(s, 'Fulfill 1042', null, { model: 'gpt-5-mini', client: mock(async () => ({ output_parsed: { ...p, clarification: null } })) }); expect(reply.mode).toBe('live_ai'); expect(reply.proposal?.source).toBe('live_ai'); });
    it('falls back on API errors, refusals, incomplete output and invented actors', async () => {
        const s = seed(), p = rulesPlan(s, 'Fulfill 1042')!;
        p.steps[0].actorId = 'invented';
        for (const parse of [async () => { throw Error('API timeout'); }, async () => ({ output_parsed: null }), async () => ({ output_parsed: { ...p, clarification: null } })]) {
            const reply = await plan(s, 'Fulfill 1042', null, { model: 'gpt-5-mini', client: mock(parse) });
            expect(reply.mode).toBe('rules');
            expect(reply.proposal?.steps[0].actorId).toBe('H1');
        }
    });
    it('returns a clarification without any executable proposal', async () => { const reply = await plan(seed(), 'Do something', null, { model: 'gpt-5-mini', client: mock(async () => ({ output_parsed: { clarification: 'Which order should I fulfill?' } })) }); expect(reply.proposal).toBeNull(); expect(reply.clarification).toMatch(/Which order/); });
});
