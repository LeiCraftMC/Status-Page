-- Migration: add `is_paused` to monitors.
-- A paused monitor keeps its history and stays visible on the public status page
-- (shown as "paused"), but the scheduler skips its checks.
-- Note: no breakpoint marker before the statement — bun:sqlite cannot run a
-- comment-only chunk, so the comment must share the statement's chunk.
ALTER TABLE `monitors` ADD `is_paused` integer DEFAULT false NOT NULL;
