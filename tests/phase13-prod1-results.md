# Phase 13 Regression Test Results — prod1
**Date:** 2026-04-21  
**Target:** http://192.168.1.110:6343  
**Branch:** huggingface-space  

---

## REG-148-01: 5-Round Chat Test ("what is 7 times 8")

| CLI | Session | Rounds | All responses = 56 | Result |
|-----|---------|--------|--------------------|--------|
| Claude | renamed-claude-test | 5/5 | Yes ("56") | PASS |
| Gemini | test upgrade gemini | 5/5 | Yes ("7 times 8 is 56.") | PASS |
| Codex | test upgrade codex | 5/5 | Yes ("56") | PASS |

---

## Test 2: Other-Project Session Resume + Hello

| Session | Project | Response to "hello" | Result |
|---------|---------|---------------------|--------|
| LinkedIn Job List | JobSearch | Full contextual response | PASS |
| BP Dev | Blueprint | Full contextual response | PASS |
| Youtube videos for BP | Blueprint | Full contextual response | PASS |

---

## Test 3: Status Bar Model Check

| CLI | Model shown | Mode | Connected | Result |
|-----|-------------|------|-----------|--------|
| Claude | Sonnet (claude-sonnet-4-6) | bypass | connected | PASS |
| Gemini | 3-flash-preview (gemini-3-flash-preview) | bypass | connected | PASS |
| Codex | gpt-5.4 | bypass | connected | PASS |

---

## Test 4: Sidebar Rendering

Projects visible with session counts: muybridge (4), Blueprint (5), JobSearch (8), upgrade-test (13), emad-host (3), hymie (1), sutherland (1). Session lists expand and show individual sessions with CLI type, timestamp, message count, and model.

**Result: PASS**

---

## Summary

| Test | Result |
|------|--------|
| REG-148-01 Claude | PASS |
| REG-148-01 Gemini | PASS |
| REG-148-01 Codex | PASS |
| Other-project sessions (3/3) | PASS |
| Status bar model check | PASS |
| Sidebar rendering | PASS |

**Overall: 6 PASS, 0 FAIL**
