# AI Radio Agent v1 — implementation plan

## Goal

Add an opt-in AI radio experience to the existing Folia app, prioritizing mobile browsers. Keep Folia's current player, queue, online-provider routing, local library, and deployment intact.

The v1 interaction is text + optional voice input, with optional spoken DJ intros. Music sources are the existing server/local library and configured online providers. The Agent proposes and explains a queue; Folia remains responsible for actual playback.

## Repository facts checked

- Default branch: `main`; work starts on `feature/ai-radio-agent-v1`.
- Frontend is React + TypeScript + Vite. `package.json` defines `npm run typecheck`, `npm run test:unit`, and a build that compiles `api-ts/` before `vite build`.
- `src/README.md` maps the app entry and advises putting new behavior in focused `src/components/app/*`, hooks, stores, or services instead of expanding `src/App.tsx`.
- Online music must be accessed through `src/services/onlineMusic/omni.ts`; components and feature services must not call provider transports directly.
- Existing AI text boundary is `src/services/aiText.ts`, currently documented as handling theme generation, lyric segmentation, and connection testing. Do not assume it already implements conversational Agent requests.
- Existing server routes include `api-ts/generate-theme.ts`, `api-ts/generate-theme_openai.ts`, and `api-ts/segment-lyrics.ts`. Inspect their shared configuration and deployment constraints before adding a route.
- Project rules in `AGENTS.md`: keep feature code cohesive, use Tailwind and lucide-react, localize UI strings in `src/i18n/locales/en.ts`, `zh-CN.ts`, and `in.ts`, and add tests.

## v1 user experience

1. A mobile-first Radio page/panel matching the supplied dark, editorial reference: understated navigation, atmospheric cover art, current track, queue, and persistent player controls.
2. A text prompt such as “深夜、下雨、想听安静的民谣”. The Agent converts it into a structured listening brief (mood, genres, energy, search terms, and optional short intro).
3. Candidate tracks are fetched from the configured sources through existing service boundaries. The user can preview the queue, play it, skip tracks, and ask for a different direction.
4. Voice input is progressive enhancement: feature-detect browser speech recognition, request microphone access only after an explicit tap, show listening/error states, and always keep text input available.
5. Spoken intros are optional and user-controlled. Use browser speech synthesis where available; stop speech on track changes, page teardown, or when the user disables narration. Music playback must not depend on TTS availability.
6. Persist lightweight preferences (favourite mood/genres, likes/skips, narration setting) using existing store/storage patterns after checking current storage contracts. Do not store API secrets in browser storage.

## Proposed boundaries (verify imports and existing patterns before coding)

- Feature UI: a focused folder under `src/components/app/` for the radio screen, prompt composer, queue and narration controls.
- Feature state: a feature-local store or hook for prompt state, generated brief, queue and narration preferences; avoid a parallel audio engine.
- Agent service: a typed service that accepts the prompt and limited playback/preferences context and returns a validated JSON brief. It must not own playback.
- Track discovery: a radio orchestration service that uses `omni` for online searches and the existing local/server library APIs where supported. Keep source identity on every candidate.
- Playback: use existing player/queue actions; do not create a second HTMLAudioElement or bypass Folia's playback system.
- Backend: add a server route only after verifying the existing AI provider/configuration path and serverless runtime. Keep provider keys server-side. If web deployment has no server-side AI key/config, show a clear setup state instead of pretending the Agent is connected.
- Voice: isolate speech-recognition and speech-synthesis behind a small browser capability adapter with typed unsupported/permission-denied states.

## Initial API contract proposal

Request:
```ts
type RadioAgentRequest = {
  message: string;
  context?: {
    currentTrack?: { title: string; artist?: string; source?: string };
    preferredGenres?: string[];
    recentFeedback?: Array<'like' | 'skip'>;
    narrationEnabled?: boolean;
  };
};
```

Validated response:
```ts
type RadioAgentBrief = {
  title: string;
  mood: string;
  genres: string[];
  searchTerms: string[];
  energy: 'low' | 'medium' | 'high';
  narration?: string;
};
```

The AI must not invent playable URLs or track IDs. It returns a listening brief; the app resolves real candidates through its existing music services. Validate all response fields and provide a deterministic fallback brief if the AI request fails.

## Implementation status

The first vertical slice is now present on `feature/ai-radio-agent-v1`:
- `src/components/app/RadioAgent.tsx`: mobile-first overlay, text prompt, browser speech recognition where supported, optional speech synthesis, station brief and track candidates.
- `api-ts/radio-agent.ts`: server-side JSON brief endpoint for Gemini or OpenAI-compatible configuration; secrets stay on the server.
- `src/App.tsx`: floating launcher and callbacks to Folia's existing local-song and online/Navidrome playback handlers.
- Locale entries added for Chinese, English and Indonesian.
- Online discovery uses `omni.searchSongs`; configured Navidrome/Subsonic discovery uses `navidromeApi.search`; local library matching uses existing `localSongs`.

Not yet verified: production build, typecheck, unit tests, Vercel preview, runtime AI credentials, and real server/provider playback. GitHub currently reports no check runs for the pull request head. Do not merge or claim deployment success until these are checked. The first slice also does not yet persist Agent preferences or use long-term personalized listening memory.

## Delivery phases

### Phase 0 — baseline and safety
- Confirm the deployed preview corresponds to the repository revision.
- Inspect `src/services/runtimeConfig.ts`, AI settings/store contracts, Omni search types, player queue mutation entry points, and local/server library access.
- Capture baseline build/typecheck/test results before functional changes.
- Keep all work on `feature/ai-radio-agent-v1`; do not commit experimental changes directly to `main`.

### Phase 1 — vertical slice
- Add the responsive radio UI and text prompt.
- Convert the prompt into a validated brief (first a deterministic fallback; connect the configured AI backend only after configuration is confirmed).
- Resolve candidates through Omni and supported local/server library services.
- Let the user explicitly start playback through Folia's existing player/queue.
- Add unit tests for brief validation, source identity, empty results, provider failures, and queue handoff.

### Phase 2 — voice and optional narration
- Add speech recognition with text fallback and permission/error handling.
- Add a narration toggle and speech-synthesis lifecycle cleanup.
- Add tests for unsupported APIs and interrupted narration.

### Phase 3 — verification and release
- Run typecheck, focused unit tests, full unit tests, and production build.
- Test narrow iPhone viewport, safe-area insets, keyboard-open prompt, queue scrolling, and player controls.
- Verify server route configuration and confirm no API key is present in client bundles.
- Publish a reviewable PR or preview before merging or changing production deployment.

## Acceptance criteria

- Existing Folia playback, queue, local library, and online providers continue to work unchanged outside the new feature.
- The radio can produce a useful brief without voice APIs; unsupported voice features never block text use.
- Only real tracks resolved by existing services are playable.
- Narration is off unless the user enables it.
- All new UI text is localized in the three required locale files.
- No secrets are shipped to the browser, no guessed server paths are used, and all claimed checks have actually run.

## Deployment checklist (phone-friendly)

1. Open the pull request: https://github.com/xiaotong123520/folia-major/pull/1
2. Before merging, inspect the "Files changed" tab and wait for checks. The repository workflow is configured to run unit tests and typechecks on non-draft PRs, but the current PR head has not yet produced check runs.
3. In Vercel, open the existing project connected to this repository and inspect Deployments for a Preview built from `feature/ai-radio-agent-v1`. Do not change the Production domain yet.
4. In Vercel Project Settings → Environment Variables, configure either `GEMINI_API_KEY` (recommended first path) or `OPENAI_API_KEY`; optionally configure `GEMINI_MODEL` or `OPENAI_API_MODEL`. Keep keys server-side; never use a `VITE_...` secret variable. Redeploy the Preview after adding variables.
5. Verify the deployed endpoint with a POST request to `/api/radio-agent` and a JSON body such as `{"message":"雨夜想听温柔民谣"}`. Expect a JSON station brief, not a track URL.
6. On the Preview site, test the AI Radio launcher on a phone, text prompt, voice permission where supported, opt-in narration, online song play, and configured Navidrome song play.

Important hosting distinction: GitHub Pages is static hosting and cannot run the `api/radio-agent` server endpoint. The Vercel Preview (or another server runtime that supports the compiled `api/radio-agent.js`) is required for AI-backed curation. If Vercel is not the production host, the UI safely falls back to local rules but will not have server-side AI until the endpoint is deployed.

