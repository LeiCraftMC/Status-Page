import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ClaudeSessionRegistry } from '../../../server/lib/claude/sessionRegistry';

describe('ClaudeSessionRegistry bookkeeping', () => {
    beforeEach(() => {
        ClaudeSessionRegistry.configure({} as any);
    });

    afterEach(async () => {
        await ClaudeSessionRegistry.stop();
    });

    function createPeer() {
        return { sent: [] as any[], send(msg: string) { this.sent.push(JSON.parse(msg)); } };
    }

    function injectSession(sessionId: string, userId: number, projectPath: string) {
        // Access private map via type assertion for test setup.
        const sessions = (ClaudeSessionRegistry as any).sessions as Map<string, any>;
        sessions.set(sessionId, {
            sessionId,
            projectPath,
            userId,
            token: 'token',
            options: { cwd: projectPath },
            queryHandle: null,
            running: true,
            turn: null,
            peers: new Set(),
            eventBuffer: [{ type: 'init', payload: { type: 'init', sessionId }, timestamp: Date.now() }],
            eventBufferBytes: 0,
            lastActivityAt: Date.now(),
            createdAt: Date.now(),
        });
    }

    test('attachPeer replays buffered events and broadcasts attached', async () => {
        injectSession('sess-1', 1, '/project/a');
        const peer = createPeer();
        const ok = await ClaudeSessionRegistry.attachPeer('sess-1', 1, 'token', '/project/a', peer);
        expect(ok).toBe(true);
        expect(peer.sent.some((m) => m.type === 'init' && m.sessionId === 'sess-1')).toBe(true);
        expect(peer.sent.some((m) => m.type === 'attached' && m.sessionId === 'sess-1')).toBe(true);
    });

    test('cross-user attach is rejected', async () => {
        injectSession('sess-2', 1, '/project/a');
        const ok = await ClaudeSessionRegistry.attachPeer('sess-2', 2, 'token', '/project/a', createPeer());
        expect(ok).toBe(false);
    });

    test('getStatusesForProject scopes by user and path', () => {
        injectSession('sess-a', 1, '/project/a');
        injectSession('sess-b', 1, '/project/b');
        injectSession('sess-c', 2, '/project/a');

        const statuses = ClaudeSessionRegistry.getStatusesForProject(1, '/project/a');
        expect(statuses.map((s) => s.sessionId)).toEqual(['sess-a']);
        expect(statuses[0]?.status).toBe('running');
        expect(statuses[0]?.attachedPeers).toBe(0);
    });

    test('detachPeer removes peer from a specific session', async () => {
        injectSession('sess-3', 1, '/project/a');
        const peer = createPeer();
        await ClaudeSessionRegistry.attachPeer('sess-3', 1, 'token', '/project/a', peer);
        const session = (ClaudeSessionRegistry as any).sessions.get('sess-3');
        expect(session.peers.has(peer)).toBe(true);

        ClaudeSessionRegistry.detachPeer(peer, 'sess-3');
        expect(session.peers.has(peer)).toBe(false);
    });

    test('cleanup removes idle sessions with no peers', async () => {
        injectSession('sess-idle', 1, '/project/a');
        const session = (ClaudeSessionRegistry as any).sessions.get('sess-idle');
        session.running = false;
        session.lastActivityAt = Date.now() - 16 * 60 * 1000;

        (ClaudeSessionRegistry as any).cleanup();
        expect((ClaudeSessionRegistry as any).sessions.has('sess-idle')).toBe(false);
    });

    test('cleanup keeps running sessions even without peers', () => {
        injectSession('sess-running', 1, '/project/a');
        const session = (ClaudeSessionRegistry as any).sessions.get('sess-running');
        session.lastActivityAt = Date.now() - 16 * 60 * 1000;

        (ClaudeSessionRegistry as any).cleanup();
        expect((ClaudeSessionRegistry as any).sessions.has('sess-running')).toBe(true);
    });
});
