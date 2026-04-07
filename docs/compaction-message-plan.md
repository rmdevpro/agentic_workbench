# Compaction Message Plan

## Guide steps with exact messages Blueprint sends at each step

***

## PHASE 1: PRE-COMPACTION

### Guide Step 1

>   Prior to this chat Blueprint will have done the following:

>   Created the recent_turns.md file

>   Placed the Claude Agent into Plan Mode

**Blueprint does (code):**

-   Extracts tail and writes `recent_turns.md` to compaction dir *(TODO: currently tail is written AFTER compaction, not before — this needs to move)*
-   Sends `/plan` to A's tmux
-   Polls until plan mode activates

***

### Guide Step 2

>   Blueprint will then open a chat with the Process Manager, which is the session we are currently in. You will read the instructions that I am giving you and reply to me with {"blueprint": "ready_to_connect"} so that you may begin assisting the agent.

**Blueprint→B:** *(the full* `compaction-prep.md` *prompt — already correct)*

**B→Blueprint:** `{"blueprint": "ready_to_connect"}`

***

### Guide Step 3

>   After Blueprint makes the connection, you will be connected directly to agent to assist.

**Blueprint→B:**

```
This is Blueprint. You are now connected to the agent.
```

*(Nothing else. B already knows what to do.)*

***

### Guide Step 4

>   Blueprint will send the following prompt to the Agent to kick it off which will appear as a helpful user prompt and hopefully get the Agent moving in the right direction. "We are going to run compaction..."

**Blueprint→A (tmuxSendKeys):** *(exact text from* `compaction-prep-to-agent.md`*)*

```
We are going to run compaction, and you need to prepare so that we can pick up where we left off before compaction without losing key context. Your plan file is the key state record that will bridge the gap. Based on this session, please update your plan file paying special attention these sections: Current Status, Key Decisions, Resume Instructions, Files Modified and Reading List. Also take this opportunity to clean up the plan overall by placing any old data in a plan archive file. Also take this opportunity to update memories or other relevant documents. DO NOT CALL EXIT PLAN MODE. I will exit plan mode when we are ready.
```

***

### Guide Step 5

>   **Blueprint will send you confirmation that you are connected** and you will immediately begin seeing replies from the Agent from the prompt I sent. There is no reason for you to jump in or introduce yourself. The Agent does not need to see your inputs as anything aside from helpful user messages. With any luck the agent will already be doing exactly what it is supposed to do.

**Blueprint→B:** *(nothing — A's response comes through the mediation loop) “This is Blueprint, you are connected to the Agent.”*

**Mediation loop:** A responds → Blueprint reads A's latest JSONL assistant entry → sends clean text to B

***

### Guide Step 6

>   Since the Agent is in Plan Mode it should be able to do all of the updates to the native Claude documents as directed by the prompt.

**Blueprint does:** nothing — waits for B to direct the conversation

***

### Guide Step 7

>   Your job at this point is to make sure the Plan file contains all the needed contents. You can send {"blueprint": "read_plan_file"} and Blueprint will write the contents to a temporary file for you to read.

**When B sends** `{"blueprint": "read_plan_file"}`**:**

**Blueprint→B:**

```
Blueprint: The plan file has been copied to /workspace/blueprint/data/compaction/plan_{id}.md. Please Read that file to review its contents.
```

*(B uses its Read tool to read it)*

**If plan file not yet written:**

**Blueprint→B:**

```
Blueprint: The plan file does not exist yet — the agent has not called ExitPlanMode and is still editing. Continue guiding the agent until all required sections are complete, then send {"blueprint": "exit_plan_mode"}. Do not send {"blueprint": "error"}.
```

>   When you send a message to the Agent while in plan mode, always end the message with admonition not to call Exit Plan Mode — it will be done for them when ready.

**Mediation loop:** B's message to A → Blueprint relays via tmuxSendKeys → A responds → Blueprint reads JSONL → sends to B

***

### Guide Step 8

>   Once all portions of the Plan file are complete you will invite the Agent to check their work.

**B→A (via Blueprint):** B sends its own message to A asking for final check *(Blueprint just relays whatever B says)*

***

### Guide Step 9

>   Once finished you will send {"blueprint": "exit_plan_mode"}

**When B sends** `{"blueprint": "exit_plan_mode"}`**:**

**Blueprint→A (tmuxSendKeys):**

```
Your plan preparation is complete. Please call ExitPlanMode now to save the plan file.
```

-   Wait for A to call ExitPlanMode and return to prompt
-   Send BTab to exit plan mode
-   Copy plan file to compaction dir

**Blueprint→B:** *(nothing — move directly to step 10)*

***

**User lost patience, couldn’t handle it anymore, send to other CLIs to see if they have some brains, any fucking**

### Guide Step 10

>   Blueprint will take the Agent out of plan mode and send the following prompt: "If Git has been used during the session, update all Git issues and Commit all uncommitted work. If Git was not used during this session simply reply as such."

**Blueprint→A (tmuxSendKeys):**

```
If Git has been used during the session, update all Git issues and Commit all uncommitted work. If Git was not used during this session simply reply as such.
```

***

### Guide Step 11

>   Again you should see the Agent doing its job again updating Git or perhaps indicating that Git was not used. Once it is finished with its Git work, send {"blueprint": "ready_to_compact"}

**Mediation loop:** A responds to Git prompt → Blueprint reads A's JSONL → sends clean text to B → B evaluates

**When B sends** `{"blueprint": "ready_to_compact"}`**:** proceed to compaction

***

### Guide Step 12

>   Blueprint will take over for you and run Compaction

**Blueprint→A (tmuxSendKeys):** `/compact`

-   Poll for completion (❯ prompt detected)

***

## PHASE 2: POST-COMPACTION

### Guide Step 1

>   Once compaction is complete Blueprint will let you know and reconnect you to the Agent.

**Blueprint→B:**

```
This is Blueprint. Compaction is complete. The conversation tail file is at {tailFile}. You are now reconnected to the agent.
```

*(Nothing about "guide the agent" — B already knows its job from the original prompt)*

***

### Guide Step 2

>   Blueprint will send the following prompt to the Agent: "Compaction is finished and it's time to recover states so we can continue..."

**Blueprint→A (tmuxSendKeys):** *(exact text from* `compaction-resume.md`*)*

```
Compaction is finished and it's time to recover states so we can continue. If you have not done so already read your plan file. Within the plan file there are several important steps laid out that you must take. 1) Fully read into context all required documents in the reading list. The optional documents are to be read as you need them. 2) Ensure you have read these other sections as well and skipped them to jump into something else: Current Status, Key Decisions, Resume Instructions, Key Files Modified. Please acknowledge when you are complete.
```

***

### Guide Step 3

>   You should see the Agent doing their job. If the Agent does not appear to have read all these required items, prompt it to make sure it does.

**Mediation loop:** A responds → Blueprint reads A's JSONL → sends to B → B evaluates and sends follow-up if needed

***

### Guide Step 4

>   Once complete, you will prompt the agent to fully read into context the recent_turns.md file. It may balk at the length, but you can remind the files importance in maintaining state.

**B→A (via Blueprint):** B sends its own message telling A to read the tail file at `{tailFile}` *(Blueprint relays whatever B says)*

***

### Guide Step 5

>   Once complete you will send {"blueprint": "resume_complete"} and Blueprint will return control to the user and close this session with the Process Manager

**When B sends** `{"blueprint": "resume_complete"}`**:** compaction complete, return result to caller
