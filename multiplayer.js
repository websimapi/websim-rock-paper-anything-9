// Multiplayer mode functionality
let room;
let multiplayerInitialized = false;
let multiplayerWins = 0;
let multiplayerLosses = 0;
let isSubmitted = false;
let opponentSubmitted = false;
let opponentReady = false;
let playerReady = false;
let playerSelection = null;
let opponentSelection = null;
let countdownInterval = null;
let timeRemaining = 30;
let emojis = []; // Added this variable to store the emojis locally

// DOM element references
const multiplayerEmojiGrid = document.getElementById('multiplayer-emoji-grid');
const multiplayerInput = document.getElementById('multiplayer-input');
const multiplayerSubmitBtn = document.getElementById('multiplayer-submit-btn');
const findOpponentBtn = document.getElementById('find-opponent-btn');
const connectionStatus = document.getElementById('connection-status');
const opponentStatus = document.getElementById('opponent-status');
const playerEmojiDisplay = document.getElementById('player-emoji-display');
const opponentEmojiDisplay = document.getElementById('opponent-emoji-display');
const playerEmojiName = document.getElementById('player-emoji-name');
const opponentEmojiName = document.getElementById('opponent-emoji-name');
const playerImage = document.getElementById('player-image');
const opponentImage = document.getElementById('opponent-image');
const playerLoadingSpinner = document.getElementById('player-loading-spinner');
const opponentLoadingSpinner = document.getElementById('opponent-loading-spinner');
const submissionStatus = document.getElementById('submission-status');
const timerDisplay = document.getElementById('timer-display');
const multiplayerResultMessage = document.getElementById('multiplayer-result-message');
const countdownTimer = document.getElementById('countdown-timer');
const multiplayerHistoryList = document.getElementById('multiplayer-history-list');
const winCount = document.getElementById('win-count');
const lossCount = document.getElementById('loss-count');
const playerImageDisplay = document.getElementById('player-image-display'); // Use the container
const opponentImageDisplay = document.getElementById('opponent-image-display'); // Use the container

// Initialize Multiplayer Mode
async function initializeMultiplayerMode() {
    if (multiplayerInitialized) return;

    console.log("Initializing Multiplayer Mode...");

    // Get emojis from the main script
    emojis = window.emojis || [];

    // Populate emoji grid for multiplayer
    multiplayerEmojiGrid.innerHTML = '';
    emojis.forEach(emojiObj => {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.textContent = emojiObj.emoji;
        emojiItem.title = emojiObj.name;
        emojiItem.addEventListener('click', () => {
            multiplayerInput.value = emojiObj.name;
        });
        multiplayerEmojiGrid.appendChild(emojiItem);
    });

    // Reset UI completely for initialization
    resetMultiplayerUI();

    // Initialize WebsimSocket
    room = new WebsimSocket();
    try {
        await room.initialize();
        connectionStatus.textContent = `Connected as ${room.peers[room.clientId].username}`;
        connectionStatus.style.color = '#4CAF50'; // Green for connected
        console.log("Websim initialized. Client ID:", room.clientId);

        // Set initial presence
        room.updatePresence({ status: 'waiting', submitted: false });

    } catch (err) {
        console.error("Failed to initialize Websim:", err);
        connectionStatus.textContent = 'Connection failed. Please refresh.';
        connectionStatus.style.color = '#f44336'; // Red for error
        return; // Stop initialization if connection fails
    }

    // Subscribe to presence changes
    room.subscribePresence((presence) => {
        console.log("Presence updated:", presence);
        const peerIds = Object.keys(room.peers).filter(id => id !== room.clientId);
        const opponentId = peerIds.length > 0 ? peerIds[0] : null; // Simple: assumes first peer is opponent

        if (opponentId) {
            const opponentData = room.peers[opponentId];
            const opponentPresence = room.presence[opponentId];
            opponentStatus.textContent = `Playing against: ${opponentData.username}`;

            // Check if opponent is ready
            opponentReady = opponentPresence && opponentPresence.status === 'ready';
            console.log(`Opponent ${opponentData.username} ready state: ${opponentReady}`);
            updateReadyStatus();

            // Check if opponent has submitted (for UI update)
            const currentOpponentSubmitted = opponentPresence && opponentPresence.submitted;
            console.log(`Opponent ${opponentData.username} submitted state: ${currentOpponentSubmitted}`);
            if (currentOpponentSubmitted && !opponentSelection) {
                // Opponent submitted, but we don't have their data yet. Show checkmark.
                opponentEmojiDisplay.textContent = "✓";
                opponentEmojiName.textContent = "Submitted";
                opponentImage.style.display = 'none';
                opponentLoadingSpinner.style.display = 'none';
            } else if (!currentOpponentSubmitted && !opponentSelection) {
                // Opponent hasn't submitted, show default
                opponentEmojiDisplay.textContent = "❓";
                opponentEmojiName.textContent = "...";
                opponentImage.style.display = 'none';
            }

            // Check if we need to resolve after a presence update triggered submission check
            checkBothSubmitted();

        } else {
            opponentStatus.textContent = "Waiting for an opponent...";
            opponentReady = false;
            opponentSelection = null; // Clear opponent selection if they leave
            if (playerReady) { // If player was ready, reset the game state
                resetMultiplayerUI(); // Reset scores, history etc. when opponent leaves
                findOpponentBtn.textContent = "Ready"; // Force button back to ready
                playerReady = false; // Set player back to not ready
            } else {
                // If player wasn't ready, just update status
                updateReadyStatus();
            }

        }
    });

    // Subscribe to room state changes (for battle results initiated by the other player)
    room.subscribeRoomState((currentRoomState) => {
        console.log("Room state updated:", currentRoomState);
        if (currentRoomState.battleResult && currentRoomState.battleResult.completed) {
            const result = currentRoomState.battleResult;
            // Ensure this result involves the current player and hasn't been displayed yet
            if ((result.playerAId === room.clientId || result.playerBId === room.clientId)) {
                console.log("Processing battle result from room state");
                displayBattleResult(result); // Display result ensures no duplicates
            }
        }
    });

    // Subscribe to presence update requests (receiving opponent's choice)
    room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
        console.log(`Received presence update request from ${fromClientId}:`, updateRequest);
        if (updateRequest.type === 'challenge' && updateRequest.selection) {
            handleOpponentSelection(updateRequest.selection, fromClientId);
        }
    });

    // Add event listeners (ensure they are added only once)
    if (!multiplayerInitialized) {
        multiplayerSubmitBtn.addEventListener('click', handleMultiplayerSubmission);
        multiplayerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !multiplayerSubmitBtn.disabled) { // Prevent double submit
                handleMultiplayerSubmission();
            }
        });
        findOpponentBtn.addEventListener('click', toggleReadyStatus);
    }

    multiplayerInitialized = true;
    console.log("Multiplayer Mode Initialized");
}

function toggleReadyStatus() {
    playerReady = !playerReady;

    room.updatePresence({
        status: playerReady ? 'ready' : 'waiting',
        submitted: false
    });

    findOpponentBtn.textContent = playerReady ? "Cancel" : "Ready";
    updateReadyStatus();
}

function updateReadyStatus() {
    if (playerReady && opponentReady) {
        // Both players are ready, start the game
        submissionStatus.textContent = "Both players ready! Game started.";
        submissionStatus.style.color = "#4CAF50";
        startCountdown();

        // Change button to Not Ready
        findOpponentBtn.textContent = "Cancel";
    } else if (playerReady) {
        submissionStatus.textContent = "Waiting for opponent to be ready...";
        submissionStatus.style.color = "#FFA500";
    } else {
        submissionStatus.textContent = "Click 'Ready' when you want to play";
        submissionStatus.style.color = "#333";
    }
}

function startCountdown() {
    timeRemaining = 30;
    clearInterval(countdownInterval);

    timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;
    countdownInterval = setInterval(() => {
        timeRemaining--;
        timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;

        if (timeRemaining <= 0) {
            clearInterval(countdownInterval);
            // Notify the user that time is up, but don't auto-submit
            if (!isSubmitted) {
                submissionStatus.textContent = "Time's up! Please make a selection.";
                submissionStatus.style.color = "#f44336";
            }
        }
    }, 1000);
}

async function handleMultiplayerSubmission(isAuto = false) {
    const userResponse = multiplayerInput.value.trim();

    if (!userResponse) {
        submissionStatus.textContent = "Please enter something!";
        submissionStatus.style.color = "#f44336";
        return;
    }

    // Clear countdown
    clearInterval(countdownInterval);

    submissionStatus.textContent = "Submitting...";
    submissionStatus.style.color = "#333";
    multiplayerSubmitBtn.disabled = true; // Disable button during submission
    multiplayerInput.disabled = true;

    // Show placeholder while processing
    playerEmojiDisplay.textContent = "⚙️";
    playerEmojiName.textContent = "Processing...";
    playerImage.style.display = 'none'; // Hide image initially
    playerLoadingSpinner.style.display = 'block'; // Show spinner in its container

    try {
        // Find matching emoji or create a new one
        let matchingEmoji = emojis.find(e => e.name.toLowerCase() === userResponse.toLowerCase());
        let userEmoji;

        if (matchingEmoji) {
            userEmoji = { ...matchingEmoji }; // Use a copy
        } else {
            // Generate emoji suggestion from LLM
            const emojiSuggestion = await suggestEmojiForItem(userResponse);
            userEmoji = {
                emoji: emojiSuggestion || '❓',
                name: userResponse.toLowerCase(),
                imageUrl: ''
            };
            // Add to local emojis if it's new concept
            if (!emojis.find(e => e.name === userEmoji.name)) {
                emojis.push(userEmoji);
                // Add to grid dynamically? Maybe not necessary if it's just local for the round
            }
        }

        // Generate image if needed or if it's a generic emoji
        if (!userEmoji.imageUrl || userEmoji.emoji === '❓') {
            playerLoadingSpinner.style.display = 'block';
            console.log(`Generating image for: ${userEmoji.name}`);
            try {
                const result = await websim.imageGen({
                    prompt: `A detailed illustration of a ${userEmoji.name}, simple clean background, high quality, digital art style`,
                    aspect_ratio: "1:1"
                });
                userEmoji.imageUrl = result.url;
                console.log(`Generated image URL: ${userEmoji.imageUrl}`);
                // Update the shared list if it was an existing emoji without an image
                const sharedEmoji = window.emojis.find(e => e.name === userEmoji.name);
                if (sharedEmoji) sharedEmoji.imageUrl = userEmoji.imageUrl;

            } catch (imgError) {
                console.error("Error generating image:", imgError);
                userEmoji.imageUrl = ''; // Ensure imageUrl is empty on error
            } finally {
                playerLoadingSpinner.style.display = 'none';
            }

        } else {
            playerLoadingSpinner.style.display = 'none'; // Ensure spinner is hidden if image exists
        }

        // Store selection but don't display final details yet
        isSubmitted = true;
        playerSelection = {
            emoji: userEmoji.emoji,
            name: userEmoji.name,
            imageUrl: userEmoji.imageUrl
        };

        // Update presence to indicate submission
        room.updatePresence({
            submitted: true
        });

        // Update UI to show submitted status
        playerEmojiDisplay.textContent = "✓";
        playerEmojiName.textContent = "Submitted";
        submissionStatus.textContent = "Submitted! Waiting for opponent...";
        submissionStatus.style.color = "#4CAF50";

        checkBothSubmitted(); // Check if opponent has also submitted

    } catch (error) {
        console.error("Error in submission:", error);
        submissionStatus.textContent = "Error processing your item!";
        submissionStatus.style.color = "#f44336";
        playerEmojiDisplay.textContent = "❓"; // Reset display on error
        playerEmojiName.textContent = "...";
        playerLoadingSpinner.style.display = 'none';
        multiplayerSubmitBtn.disabled = false; // Re-enable button on error
        multiplayerInput.disabled = false;
    }
}

function checkBothSubmitted() {
    // Check based on presence state
    const opponentId = Object.keys(room.peers).find(id => id !== room.clientId);
    let currentOpponentSubmitted = false;
    if (opponentId && room.presence[opponentId]) {
        currentOpponentSubmitted = room.presence[opponentId].submitted;
        // Update opponent UI if they submitted
        if (currentOpponentSubmitted && !opponentSelection) {
            opponentEmojiDisplay.textContent = "✓";
            opponentEmojiName.textContent = "Submitted";
            opponentImage.style.display = 'none'; // Hide image until revealed
            opponentLoadingSpinner.style.display = 'none'; // Hide spinner
        }
    }

    if (isSubmitted && currentOpponentSubmitted) {
        submissionStatus.textContent = "Both players submitted! Revealing choices...";
        console.log("Both submitted. Player selection:", playerSelection);

        // Get opponent ID again (in case presence updated)
        const finalOpponentId = Object.keys(room.peers).find(id => id !== room.clientId);

        if (finalOpponentId && playerSelection) {
            // Reveal player's choice visually
            playerEmojiDisplay.textContent = playerSelection.emoji;
            playerEmojiName.textContent = playerSelection.name;
            playerImage.src = playerSelection.imageUrl || '';
            playerImage.style.display = playerSelection.imageUrl ? 'block' : 'none';
            playerLoadingSpinner.style.display = 'none'; // Ensure spinner is off

            // Send our selection to opponent
            console.log(`Sending challenge to ${finalOpponentId}`);
            room.requestPresenceUpdate(finalOpponentId, {
                type: 'challenge',
                selection: playerSelection
            });

            // If we already received the opponent's selection, resolve now
            if (opponentSelection) {
                console.log("Already have opponent selection. Resolving battle.");
                // Reveal opponent's choice visually if not already done
                opponentEmojiDisplay.textContent = opponentSelection.emoji;
                opponentEmojiName.textContent = opponentSelection.name;
                opponentImage.src = opponentSelection.imageUrl || '';
                opponentImage.style.display = opponentSelection.imageUrl ? 'block' : 'none';
                opponentLoadingSpinner.style.display = 'none'; // Ensure spinner is off

                resolveBattle();
            } else {
                console.log("Waiting for opponent's selection data...");
                submissionStatus.textContent = "Waiting for opponent's data...";
                // Show opponent submitted checkmark still
                opponentEmojiDisplay.textContent = "✓";
                opponentEmojiName.textContent = "Submitted";
            }
        } else {
            console.log("Missing opponent ID or player selection when checking both submitted.");
            submissionStatus.textContent = "Error preparing battle...";
        }
    } else if (isSubmitted) {
        submissionStatus.textContent = "Submitted! Waiting for opponent...";
    } else if (currentOpponentSubmitted) {
        // This case might happen if opponent submits before player
        submissionStatus.textContent = "Opponent submitted! Make your choice.";
    }
}

function handleOpponentSelection(selection, fromClientId) {
    console.log(`Received opponent selection from ${fromClientId}:`, selection);
    opponentSelection = selection;

    // Reveal opponent's choice visually
    opponentEmojiDisplay.textContent = opponentSelection.emoji;
    opponentEmojiName.textContent = opponentSelection.name;
    opponentImage.src = opponentSelection.imageUrl || '';
    opponentImage.style.display = opponentSelection.imageUrl ? 'block' : 'none';
    opponentLoadingSpinner.style.display = 'none'; // Ensure spinner is off

    // If we have already submitted and revealed our choice, resolve battle
    if (isSubmitted && playerSelection) {
        console.log("Have player selection. Resolving battle after receiving opponent's.");
        resolveBattle();
    } else {
        console.log("Received opponent selection, but player hasn't submitted or revealed yet.");
        // Player's UI should already show "Submitted" or prompt to submit
    }
}

async function resolveBattle() {
    // Ensure we have both selections
    if (!playerSelection || !opponentSelection) {
        console.error("Attempted to resolve battle without full selections.");
        multiplayerResultMessage.textContent = "Error: Missing selection data for battle.";
        return;
    }

    multiplayerResultMessage.textContent = "Determining the winner...";
    countdownTimer.textContent = "Battle!";
    console.log("Resolving battle between:", playerSelection, "and", opponentSelection);

    try {
        // Check if player selection beats opponent
        // Use a copy of opponentSelection to avoid potential modification issues if checkIfBeats changes it
        const result = await checkIfBeats(playerSelection.name, { ...opponentSelection });

        // Create battle result object
        const battleResult = {
            playerAId: room.clientId,
            playerBId: Object.keys(room.peers).find(id => id !== room.clientId),
            playerASelection: { ...playerSelection }, // Use copies
            playerBSelection: { ...opponentSelection }, // Use copies
            playerAWins: result.isWinner,
            reason: result.reason,
            timestamp: Date.now(),
            completed: true // Mark as completed for state subscription
        };

        console.log("Battle result calculated:", battleResult);

        // Update room state with battle result
        // Only one client needs to do this ideally, but doing it on both is okay for now
        // A better approach would be a dedicated "judge" or deterministic resolution
        room.updateRoomState({
            // Use a unique key for each battle maybe? Or just overwrite last result
            battleResult: battleResult,
            // Clear the result after a delay? Or handle display logic based on timestamp
        });

        // Display result locally immediately (room state update confirms for others)
        displayBattleResult(battleResult);

    } catch (error) {
        console.error("Error resolving battle:", error);
        multiplayerResultMessage.textContent = "Error determining the winner!";
        countdownTimer.textContent = "Error";
        // Maybe reset after a delay here too?
        setTimeout(() => {
            resetMultiplayerStateForNextRound();
            updateReadyStatus(); // Go back to ready prompt
        }, 5000);
    }
}

async function checkIfBeats(challenger, defending) {
    const systemPrompt = `You are the judge in a game of "Rock Paper Anything". 
Assess if the challenger's item would logically beat the defending item in a "rock paper scissors" style comparison.
Follow these rules:
1. Consider both real-world physics and pop culture references.
2. Provide a short explanation for your decision.
3. Be reasonable but creative in your judgments.
4. If the challenger wins, provide an appropriate emoji that represents the challenger item.

Response must be in this JSON format:
{
  "isWinner": boolean,
  "reason": "brief explanation",
  "suggestedEmoji": "emoji character" (only if isWinner is true)
}`;

    const completion = await websim.chat.completions.create({
        messages: [
            {
                role: "system",
                content: systemPrompt
            },
            {
                role: "user",
                content: `Defending: ${defending.name} (${defending.emoji})
Challenger: ${challenger}
Is the challenger the winner? Why or why not?`
            }
        ],
        json: true
    });

    try {
        return JSON.parse(completion.content);
    } catch (error) {
        console.error("Error parsing LLM response:", error);
        throw new Error("Failed to get a valid response");
    }
}

function displayBattleResult(result) {
    // This function is now primarily called after resolveBattle completes locally,
    // or via room state subscription if the other player resolved first.
    // Prevent displaying the same result multiple times if triggered by state change shortly after local resolve
    const lastDisplayedTimestamp = multiplayerHistoryList.dataset.lastTimestamp || 0;
    if (result.timestamp <= lastDisplayedTimestamp) {
        console.log("Skipping duplicate battle result display.");
        return;
    }
    multiplayerHistoryList.dataset.lastTimestamp = result.timestamp;

    console.log("Displaying battle result:", result);
    const isPlayerA = result.playerAId === room.clientId;
    const playerWon = isPlayerA ? result.playerAWins : !result.playerAWins;

    const playerSide = isPlayerA ? result.playerASelection : result.playerBSelection;
    const opponentSide = isPlayerA ? result.playerBSelection : result.playerASelection;

    // Ensure UI reflects the final choices if it wasn't fully updated before
    playerEmojiDisplay.textContent = playerSide.emoji;
    playerEmojiName.textContent = playerSide.name;
    playerImage.src = playerSide.imageUrl || '';
    playerImage.style.display = playerSide.imageUrl ? 'block' : 'none';
    playerLoadingSpinner.style.display = 'none';

    opponentEmojiDisplay.textContent = opponentSide.emoji;
    opponentEmojiName.textContent = opponentSide.name;
    opponentImage.src = opponentSide.imageUrl || '';
    opponentImage.style.display = opponentSide.imageUrl ? 'block' : 'none';
    opponentLoadingSpinner.style.display = 'none';

    // Update score counters only once per result
    if (playerWon) {
        multiplayerWins++;
        winCount.textContent = multiplayerWins;
    } else {
        multiplayerLosses++;
        lossCount.textContent = multiplayerLosses;
    }

    // Display result message
    countdownTimer.textContent = playerWon ? "Victory!" : "Defeat!";
    multiplayerResultMessage.textContent = result.reason || "No reason provided.";
    multiplayerResultMessage.style.color = playerWon ? "#4CAF50" : "#f44336";

    // Add to history
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item multiplayer-history-item'; // Add specific class

    historyItem.innerHTML = `
        <div class="history-player-side">
             <div class="history-item-emoji">
                 ${playerSide.emoji}
                 ${playerSide.imageUrl ? `<img class="history-item-image" src="${playerSide.imageUrl}" alt="${playerSide.name}">` : '<div class="history-item-image-placeholder"></div>'}
             </div>
             <div class="history-item-name">${playerSide.name}</div>
         </div>
         <div class="history-vs">
            <span class="${playerWon ? 'win' : 'lose'}">${playerWon ? 'WIN' : 'LOSE'}</span>
            VS
            <div class="history-item-reason">${result.reason}</div>
         </div>
         <div class="history-player-side opponent-side">
             <div class="history-item-emoji">
                 ${opponentSide.emoji}
                 ${opponentSide.imageUrl ? `<img class="history-item-image" src="${opponentSide.imageUrl}" alt="${opponentSide.name}">` : '<div class="history-item-image-placeholder"></div>'}
             </div>
              <div class="history-item-name">${opponentSide.name}</div>
         </div>
    `;

    multiplayerHistoryList.insertBefore(historyItem, multiplayerHistoryList.firstChild);

    // Reset state for the next round after a delay
    setTimeout(() => {
        resetMultiplayerStateForNextRound();
        updateReadyStatus(); // Go back to ready prompt
    }, 5000); // 5 second delay before resetting UI for next round
}

function resetMultiplayerStateForNextRound() {
    console.log("Resetting for next round");
    // Reset state variables
    isSubmitted = false;
    // opponentSubmitted is derived from presence, no need to reset here
    playerSelection = null;
    opponentSelection = null; // Crucial to reset opponent selection
    clearInterval(countdownInterval);

    // Reset UI elements
    playerEmojiDisplay.textContent = "❓";
    playerEmojiName.textContent = "...";
    playerImage.src = "";
    playerImage.style.display = "none";
    playerLoadingSpinner.style.display = "none";

    opponentEmojiDisplay.textContent = "❓";
    opponentEmojiName.textContent = "...";
    opponentImage.src = "";
    opponentImage.style.display = "none";
    opponentLoadingSpinner.style.display = 'none';

    submissionStatus.textContent = ""; // Clear submission status
    timerDisplay.textContent = ""; // Clear timer
    multiplayerResultMessage.textContent = ""; // Clear result message
    countdownTimer.textContent = ""; // Clear countdown/battle text
    multiplayerInput.value = ""; // Clear input field
    multiplayerInput.disabled = false; // Re-enable input
    multiplayerSubmitBtn.disabled = false; // Re-enable button

    // Update presence: player is no longer submitted, keep status as 'ready' or 'waiting' based on button
    const currentStatus = playerReady ? 'ready' : 'waiting';
    if (room) {
        room.updatePresence({
            submitted: false,
            status: currentStatus
        });
    }

    // The 'Ready' button state should persist unless the player explicitly clicks Cancel
    findOpponentBtn.textContent = playerReady ? "Cancel" : "Ready";
}

function resetMultiplayerUI() {
    // This function is now more about the initial setup or full reset when opponent leaves
    resetMultiplayerStateForNextRound(); // Perform the round reset logic

    // Reset things not covered by round reset
    playerReady = false; // Assume not ready initially
    opponentReady = false;
    multiplayerWins = 0; // Reset scores if called from initial setup/opponent leave
    multiplayerLosses = 0;
    winCount.textContent = '0';
    lossCount.textContent = '0';
    multiplayerHistoryList.innerHTML = ''; // Clear history
    multiplayerHistoryList.dataset.lastTimestamp = 0; // Reset timestamp tracking
    opponentStatus.textContent = "Waiting for an opponent...";

    findOpponentBtn.textContent = "Ready"; // Reset button text

    // Update presence fully
    if (room) {
        room.updatePresence({
            status: 'waiting',
            submitted: false
        });
    }
}

async function suggestEmojiForItem(item) {
    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `For the given item, suggest a single emoji character that best represents it. 
                    Respond with only the emoji character and nothing else.`
                },
                {
                    role: "user",
                    content: item
                }
            ]
        });

        return completion.content.trim();
    } catch (error) {
        console.error("Error suggesting emoji:", error);
        return "❓";
    }
}