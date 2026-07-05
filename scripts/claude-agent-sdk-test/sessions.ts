import { listSessions } from "@anthropic-ai/claude-agent-sdk";

const all_sessions = await listSessions();
all_sessions.forEach(session => {
    console.log(session);
});

const sessions_for_project = await listSessions({
    dir: "/tmp/test-claude",
});
sessions_for_project.forEach(session => {
    console.log(session);
});

