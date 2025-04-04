// Multiplayer mode functionality
let room;
let multiplayerInitialized = false;
let multiplayerWins = 0;
let multiplayerLosses = 0;
let isSubmitted = false;
// Removed opponentSubmitted as it's derived from presence
let opponentReady = false;
let playerReady = false;
let playerSelection = null;
let opponentSelection = null;
let countdownInterval = null;
let timeRemaining = 30;
let emojis = []; // Added this variable to store the emojis locally
let currentBattleResultId = null; // To prevent duplicate result processing

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
        room.updatePresence({ status: 'waiting', submitted: false, readyToReveal: false }); // Added readyToReveal

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


            // Check if opponent has submitted (for UI update)
            const currentOpponentSubmitted = opponentPresence && opponentPresence.submitted;
            const currentOpponentReadyToReveal = opponentPresence && opponentPresence.readyToReveal; // Check new flag
            console.log(`Opponent ${opponentData.username} submitted state: ${currentOpponentSubmitted}, readyToReveal: ${currentOpponentReadyToReveal}`);

            if (currentOpponentSubmitted && !opponentSelection) {
                // Opponent submitted, but we don't have their data yet / they aren't ready to reveal. Show checkmark.
                opponentEmojiDisplay.textContent = "✓";
                opponentEmojiName.textContent = "Submitted";
                opponentImage.style.display = 'none';
                opponentLoadingSpinner.style.display = 'none';
                opponentImageDisplay.style.backgroundColor = '#f9f9f9'; // Ensure background is default
            } else if (!currentOpponentSubmitted && !opponentSelection) {
                // Opponent hasn't submitted, show default
                opponentEmojiDisplay.textContent = "❓";
                opponentEmojiName.textContent = "...";
                opponentImage.style.display = 'none';
                opponentImageDisplay.style.backgroundColor = '#f9f9f9'; // Ensure background is default
            }

            // Update ready status (this might trigger game start)
            updateReadyStatus();

            // Check if we need to reveal/resolve based on readiness to reveal
            if (playerReady && opponentReady) { // Only check if both are in a 'ready' game state
                checkReadyToReveal();
            }

        } else {
            opponentStatus.textContent = "Waiting for an opponent...";
            opponentReady = false;
            opponentSelection = null; // Clear opponent selection if they leave
            // If player was ready, reset the game state, otherwise just update status
            if (playerReady) {
                resetMultiplayerUI();
                playerReady = false; // Ensure player is not ready anymore
            }
            updateReadyStatus(); // Update UI based on player state
        }
    });

    // Subscribe to room state changes (for battle results initiated by the other player)
    room.subscribeRoomState((currentRoomState) => {
        console.log("Room state updated:", currentRoomState);
        if (currentRoomState.battleResult && currentRoomState.battleResult.id && currentRoomState.battleResult.id !== currentBattleResultId) {
            const result = currentRoomState.battleResult;
            // Ensure this result involves the current player
            if (result.playerAId === room.clientId || result.playerBId === room.clientId) {
                console.log("Processing battle result from room state");
                currentBattleResultId = result.id; // Mark this ID as processed
                // Ensure opponent's image is loaded before displaying if needed
                ensureImageLoaded(opponentImage, opponentLoadingSpinner, opponentImageDisplay, result.playerAId === room.clientId ? result.playerBSelection : result.playerASelection)
                    .then(() => {
                        displayBattleResult(result); // Display result after image is ready
                    });
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
    if (!room) return; // Ensure room is initialized

    playerReady = !playerReady;

    room.updatePresence({
        status: playerReady ? 'ready' : 'waiting',
        submitted: false, // Reset submission status when changing ready state
        readyToReveal: false
    });

    findOpponentBtn.textContent = playerReady ? "Cancel" : "Ready";
    resetMultiplayerStateForNextRound(); // Reset UI elements when changing ready state
    updateReadyStatus();
}

function updateReadyStatus() {
    if (playerReady && opponentReady) {
        // Both players are ready, indicate game started if not already
        if (!countdownInterval && timeRemaining > 0) { // Only start countdown once
            submissionStatus.textContent = "Both players ready! Make your selection.";
            submissionStatus.style.color = "#4CAF50";
            startCountdown();
            multiplayerSubmitBtn.disabled = false; // Ensure submit is enabled
            multiplayerInput.disabled = false;
        }
    } else if (playerReady) {
        submissionStatus.textContent = "Waiting for opponent to be ready...";
        submissionStatus.style.color = "#FFA500";
        clearInterval(countdownInterval); // Stop timer if opponent leaves or cancels
        timerDisplay.textContent = "";
        multiplayerSubmitBtn.disabled = true; // Disable submit if opponent not ready
        multiplayerInput.disabled = true;
    } else {
        submissionStatus.textContent = "Click 'Ready' when you want to play";
        submissionStatus.style.color = "#333";
        clearInterval(countdownInterval); // Stop timer if player cancels
        timerDisplay.textContent = "";
        multiplayerSubmitBtn.disabled = true; // Disable submit if player not ready
        multiplayerInput.disabled = true;
    }
    // Ensure button reflects state
    findOpponentBtn.textContent = playerReady ? "Cancel" : "Ready";
}

function startCountdown() {
    timeRemaining = 30; // Reset time
    clearInterval(countdownInterval); // Clear any existing interval

    timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;
    countdownInterval = setInterval(() => {
        timeRemaining--;
        timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;

        if (timeRemaining <= 0) {
            clearInterval(countdownInterval);
            timerDisplay.textContent = "Time's up!";
            // Handle time up: maybe force a default choice or just wait indefinitely?
            // For now, just inform and potentially disable submit if not already submitted
            if (!isSubmitted) {
                submissionStatus.textContent = "Time's up! Please make a selection.";
                submissionStatus.style.color = "#f44336";
                // Optionally disable submit button here if desired
                // multiplayerSubmitBtn.disabled = true;
            }
        }
    }, 1000);
}

// Helper function to ensure image is loaded before proceeding
function ensureImageLoaded(imgElement, spinnerElement, containerElement, selection) {
    return new Promise((resolve) => {
        if (selection && selection.imageUrl) {
            spinnerElement.style.display = 'block';
            containerElement.style.backgroundColor = '#f0f0f0'; // Loading background
            imgElement.style.display = 'none'; // Hide image while loading
            imgElement.onload = () => {
                spinnerElement.style.display = 'none';
                imgElement.style.display = 'block'; // Show image once loaded
                containerElement.style.backgroundColor = '#f9f9f9'; // Reset background
                console.log(`Image loaded for ${selection.name}: ${selection.imageUrl}`);
                resolve();
            };
            imgElement.onerror = () => {
                console.error(`Failed to load image for ${selection.name}: ${selection.imageUrl}`);
                spinnerElement.style.display = 'none';
                imgElement.style.display = 'none'; // Keep image hidden on error
                containerElement.style.backgroundColor = '#f9f9f9'; // Reset background
                selection.imageUrl = ''; // Clear invalid URL
                resolve(); // Resolve even on error to not block the game
            };
            imgElement.src = selection.imageUrl;
        } else {
            spinnerElement.style.display = 'none'; // No image URL, hide spinner
            imgElement.style.display = 'none'; // Ensure image element is hidden
            containerElement.style.backgroundColor = '#f9f9f9'; // Reset background
            resolve(); // Resolve immediately if no image URL
        }
    });
}

async function handleMultiplayerSubmission() {
    if (!playerReady || !opponentReady) {
        submissionStatus.textContent = "Wait for both players to be ready!";
        submissionStatus.style.color = "#f44336";
        return;
    }

    const userResponse = multiplayerInput.value.trim();
    if (!userResponse) {
        submissionStatus.textContent = "Please enter something!";
        submissionStatus.style.color = "#f44336";
        return;
    }

    // Stop timer
    clearInterval(countdownInterval);
    timerDisplay.textContent = "Submitted!"; // Change timer display

    submissionStatus.textContent = "Processing your choice...";
    submissionStatus.style.color = "#333";
    multiplayerSubmitBtn.disabled = true; // Disable button during processing
    multiplayerInput.disabled = true;

    // Update UI immediately to show processing/submitted visually
    playerEmojiDisplay.textContent = "⚙️";
    playerEmojiName.textContent = "Processing...";
    playerImage.style.display = 'none';
    playerLoadingSpinner.style.display = 'block';
    playerImageDisplay.style.backgroundColor = '#f0f0f0'; // Loading background

    try {
        // Find matching emoji or create a new one
        let matchingEmoji = emojis.find(e => e.name.toLowerCase() === userResponse.toLowerCase());
        let localUserEmoji; // Use a local variable for processing

        if (matchingEmoji) {
            localUserEmoji = { ...matchingEmoji }; // Use a copy
        } else {
            // Generate emoji suggestion from LLM
            const emojiSuggestion = await suggestEmojiForItem(userResponse);
            localUserEmoji = {
                emoji: emojiSuggestion || '❓',
                name: userResponse.toLowerCase(),
                imageUrl: ''
            };
            // Add to local emojis if it's a new concept
            if (!emojis.find(e => e.name === localUserEmoji.name)) {
                emojis.push({ ...localUserEmoji }); // Add a copy
                // Add to grid dynamically for future use in this session
                const emojiItem = document.createElement('div');
                emojiItem.className = 'emoji-item';
                emojiItem.textContent = localUserEmoji.emoji;
                emojiItem.title = localUserEmoji.name;
                emojiItem.addEventListener('click', () => {
                    multiplayerInput.value = localUserEmoji.name;
                });
                multiplayerEmojiGrid.appendChild(emojiItem);
            }
        }

        // --- CRITICAL CHANGE: Generate image BEFORE setting submitted state ---
        if (!localUserEmoji.imageUrl || localUserEmoji.emoji === '❓') {
            console.log(`Generating image for: ${localUserEmoji.name}`);
            try {
                const result = await websim.imageGen({
                    prompt: `A detailed illustration of a ${localUserEmoji.name}, simple clean background, high quality, digital art style`,
                    aspect_ratio: "1:1"
                });
                localUserEmoji.imageUrl = result.url;
                console.log(`Generated image URL: ${localUserEmoji.imageUrl}`);
                // Update the shared global list if it was an existing emoji without an image
                const sharedEmoji = window.emojis.find(e => e.name === localUserEmoji.name);
                if (sharedEmoji && !sharedEmoji.imageUrl) sharedEmoji.imageUrl = localUserEmoji.imageUrl;

            } catch (imgError) {
                console.error("Error generating image:", imgError);
                localUserEmoji.imageUrl = ''; // Ensure imageUrl is empty on error
            }
        }
        // --- Image generation complete (or skipped/failed) ---

        // Now set the player selection state
        playerSelection = { ...localUserEmoji }; // Store the final selection with image URL

        // Set submitted status and update presence AFTER image gen attempt
        isSubmitted = true;
        room.updatePresence({
            submitted: true,
            // Do not set readyToReveal yet, wait for image load confirmation
        });

        // Update UI to show "Submitted ✓" but keep image loading until confirmed
        playerEmojiDisplay.textContent = "✓";
        playerEmojiName.textContent = "Submitted";
        submissionStatus.textContent = "Submitted! Waiting for opponent...";
        submissionStatus.style.color = "#4CAF50";

        // Ensure the image loads visually, then mark as readyToReveal
        ensureImageLoaded(playerImage, playerLoadingSpinner, playerImageDisplay, playerSelection)
            .then(() => {
                // Now that image is loaded (or failed gracefully), mark as ready
                room.updatePresence({
                    readyToReveal: true
                });
                console.log("Player marked as readyToReveal");
                checkReadyToReveal(); // Check if both are now ready to reveal
            });

    } catch (error) {
        console.error("Error in submission:", error);
        submissionStatus.textContent = "Error processing your item!";
        submissionStatus.style.color = "#f44336";
        playerEmojiDisplay.textContent = "❓"; // Reset display on error
        playerEmojiName.textContent = "...";
        playerLoadingSpinner.style.display = 'none';
        playerImageDisplay.style.backgroundColor = '#f9f9f9'; // Reset background
        multiplayerSubmitBtn.disabled = false; // Re-enable button on error
        multiplayerInput.disabled = false;
        // Reset submission status in presence if error occurred before finishing
        if (room && !isSubmitted) {
            room.updatePresence({ submitted: false, readyToReveal: false });
        }
    }
}

// New function to check if both players are ready to reveal
function checkReadyToReveal() {
    if (!isSubmitted || !playerSelection) return; // Player hasn't submitted or processed yet

    const opponentId = Object.keys(room.peers).find(id => id !== room.clientId);
    if (!opponentId || !room.presence[opponentId]) return; // Opponent not found or no presence data

    const opponentPresence = room.presence[opponentId];
    const opponentIsReadyToReveal = opponentPresence.readyToReveal;
    const playerIsReadyToReveal = room.presence[room.clientId]?.readyToReveal; // Check own state

    if (playerIsReadyToReveal && opponentIsReadyToReveal) {
        submissionStatus.textContent = "Both ready! Revealing choices...";
        console.log("Both players ready to reveal. Player selection:", playerSelection);

        // Send our selection to the opponent (they should do the same)
        // This request might arrive before the opponent is ready to process it locally, but that's okay
        console.log(`Sending challenge request to ${opponentId}`);
        room.requestPresenceUpdate(opponentId, {
            type: 'challenge',
            selection: playerSelection // Send the fully processed selection
        });

        // If we have already received the opponent's selection via handleOpponentSelection, resolve now.
        // Otherwise, handleOpponentSelection will trigger the resolve when the data arrives.
        if (opponentSelection) {
            console.log("Player ready to reveal, and already have opponent selection. Resolving battle.");
            // Ensure opponent's image is loaded visually before resolving
            ensureImageLoaded(opponentImage, opponentLoadingSpinner, opponentImageDisplay, opponentSelection)
                .then(() => {
                    resolveBattle();
                });
        } else {
            console.log("Player ready to reveal, waiting for opponent's selection data...");
            // Update UI to show opponent submitted if not already done
            if (opponentPresence.submitted) {
                opponentEmojiDisplay.textContent = "✓";
                opponentEmojiName.textContent = "Submitted";
            }
        }
    } else if (playerIsReadyToReveal) {
        submissionStatus.textContent = "Waiting for opponent to finalize submission...";
        // Update UI to show opponent submitted if not already done
        if (opponentPresence.submitted) {
            opponentEmojiDisplay.textContent = "✓";
            opponentEmojiName.textContent = "Submitted";
        }
    } else {
        // Player is submitted but image might still be loading/confirming
        submissionStatus.textContent = "Finalizing your submission...";
    }
}

function handleOpponentSelection(selection, fromClientId) {
    console.log(`Received opponent selection from ${fromClientId}:`, selection);
    opponentSelection = selection; // Store the opponent's final selection data

    // Now check if we are ready to resolve the battle
    const playerIsReadyToReveal = room.presence[room.clientId]?.readyToReveal;

    if (isSubmitted && playerSelection && playerIsReadyToReveal) {
        console.log("Have player selection and ready to reveal. Resolving battle after receiving opponent's.");
        // Ensure opponent's image is loaded visually before resolving
        ensureImageLoaded(opponentImage, opponentLoadingSpinner, opponentImageDisplay, opponentSelection)
            .then(() => {
                resolveBattle();
            });
    } else {
        console.log("Received opponent selection, but player isn't ready to reveal yet. Will resolve when player is ready.");
        // Update opponent UI to show submitted, but don't reveal image fully until resolveBattle
        opponentEmojiDisplay.textContent = "✓";
        opponentEmojiName.textContent = "Submitted";
        opponentLoadingSpinner.style.display = 'block'; // Indicate potential loading
        opponentImageDisplay.style.backgroundColor = '#f0f0f0';
    }
}

async function resolveBattle() {
    // Ensure we have both selections and opponent ID
    const opponentId = Object.keys(room.peers).find(id => id !== room.clientId);
    if (!playerSelection || !opponentSelection || !opponentId) {
        console.error("Attempted to resolve battle without full selections or opponent ID.");
        multiplayerResultMessage.textContent = "Error: Missing data for battle.";
        // Optionally reset here? Or wait for user action.
        return;
    }

    // Prevent resolving the same battle multiple times if triggers overlap
    if (multiplayerResultMessage.textContent.includes("Victory!") || multiplayerResultMessage.textContent.includes("Defeat!") || multiplayerResultMessage.textContent.includes("Draw!")) {
        console.log("Battle already resolved, skipping.");
        return;
    }

    multiplayerResultMessage.textContent = "Determining the winner...";
    countdownTimer.textContent = "Battle!";
    console.log("Resolving battle between:", playerSelection, "and", opponentSelection);

    // Reveal both choices visually now that resolution is starting
    playerEmojiDisplay.textContent = playerSelection.emoji;
    playerEmojiName.textContent = playerSelection.name;
    // ensureImageLoaded should have handled player image display already

    opponentEmojiDisplay.textContent = opponentSelection.emoji;
    opponentEmojiName.textContent = opponentSelection.name;
    // ensureImageLoaded should have handled opponent image display already

    try {
        // Determine winner using LLM
        const result = await checkIfBeats(playerSelection.name, { ...opponentSelection }); // Pass copies

        // Check for draw possibility (LLM might not explicitly handle this, implement simple name check)
        let playerWins = result.isWinner;
        let isDraw = false;
        if (playerSelection.name.toLowerCase() === opponentSelection.name.toLowerCase()) {
            isDraw = true;
            playerWins = false; // Neither wins in a draw
            result.reason = "It's a draw! Both chose the same item.";
        }

        // Create a unique battle ID based on participants and timestamp
        const battleId = `battle-${room.clientId}-${opponentId}-${Date.now()}`;

        // Create battle result object
        const battleResult = {
            id: battleId, // Unique ID for this battle instance
            playerAId: room.clientId,
            playerBId: opponentId,
            playerASelection: { ...playerSelection }, // Use copies
            playerBSelection: { ...opponentSelection }, // Use copies
            playerAWins: playerWins,
            isDraw: isDraw, // Add draw flag
            reason: result.reason,
            timestamp: Date.now(),
            completed: true // Mark as completed for state subscription
        };

        console.log("Battle result calculated:", battleResult);
        currentBattleResultId = battleId; // Store the ID of the result being processed/sent

        // Update room state with the unique battle result
        // Only one client needs to *initiate* the state update ideally.
        // A simple leader election (e.g., client ID sort order) could decide who sends.
        // For simplicity, both might send, but the unique ID prevents duplicate processing.
        if (room.clientId < opponentId) { // Simple leader election: lower ID sends first
            console.log("Updating room state with battle result as leader.");
            room.updateRoomState({
                battleResult: battleResult
            });
        } else {
            console.log("Deferring room state update to opponent (leader).");
            // The other client's update will trigger the state change handler
            // However, display locally immediately for responsiveness.
        }

        // Display result locally immediately
        displayBattleResult(battleResult);

    } catch (error) {
        console.error("Error resolving battle:", error);
        multiplayerResultMessage.textContent = "Error determining the winner!";
        countdownTimer.textContent = "Error";
        // Reset after a delay
        setTimeout(() => {
            resetMultiplayerStateForNextRound();
            updateReadyStatus(); // Go back to ready prompt
        }, 5000);
    }
}

// checkIfBeats remains the same as it uses the LLM for comparison
async function checkIfBeats(challenger, defending) {
    const systemPrompt = `You are the judge in a game of "Rock Paper Anything".
Assess if the challenger's item would logically beat the defending item in a "rock paper scissors" style comparison.
Follow these rules:
1. Consider both real-world physics and pop culture references.
2. Provide a short explanation for your decision.
3. Be reasonable but creative in your judgments.
4. If the challenger wins, provide an appropriate emoji that represents the challenger item.
5. If it's clearly a draw (same item or logically equivalent), state that in the reason.

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
        // Provide a default non-winner response on error
        return {
            isWinner: false,
            reason: "Error communicating with the judge.",
            suggestedEmoji: null
        };
        // throw new Error("Failed to get a valid response");
    }
}

function displayBattleResult(result) {
    // Prevent displaying the same result multiple times
    // currentBattleResultId is checked in the room state subscription,
    // and set locally in resolveBattle before calling this.
    // Add an extra check against the last displayed timestamp just in case.
    const lastDisplayedTimestamp = multiplayerHistoryList.dataset.lastTimestamp || 0;
    if (result.timestamp <= lastDisplayedTimestamp && multiplayerHistoryList.firstChild) {
        console.log(`Skipping duplicate battle result display for timestamp ${result.timestamp}.`);
        return;
    }
    multiplayerHistoryList.dataset.lastTimestamp = result.timestamp; // Update timestamp tracking

    console.log("Displaying battle result:", result);
    const isPlayerA = result.playerAId === room.clientId;
    const playerWon = isPlayerA ? result.playerAWins : !result.playerAWins;
    const opponentWon = !isPlayerA ? result.playerAWins : !result.playerAWins; // Calculate opponent win status
    const isDraw = result.isDraw;

    const playerSide = isPlayerA ? result.playerASelection : result.playerBSelection;
    const opponentSide = isPlayerA ? result.playerBSelection : result.playerASelection;

    // Ensure UI reflects the final choices (should be handled by ensureImageLoaded now)
    playerEmojiDisplay.textContent = playerSide.emoji;
    playerEmojiName.textContent = playerSide.name;
    playerImage.src = playerSide.imageUrl || '';
    playerImage.style.display = playerSide.imageUrl ? 'block' : 'none';
    playerLoadingSpinner.style.display = 'none';
    playerImageDisplay.style.backgroundColor = '#f9f9f9';

    opponentEmojiDisplay.textContent = opponentSide.emoji;
    opponentEmojiName.textContent = opponentSide.name;
    opponentImage.src = opponentSide.imageUrl || '';
    opponentImage.style.display = opponentSide.imageUrl ? 'block' : 'none';
    opponentLoadingSpinner.style.display = 'none';
    opponentImageDisplay.style.backgroundColor = '#f9f9f9';

    // Update score counters only once per result
    // Check if the history item for this timestamp already exists to prevent double counting
    const existingHistoryItem = Array.from(multiplayerHistoryList.children).find(item => item.dataset.timestamp === String(result.timestamp));

    if (!existingHistoryItem) {
        if (isDraw) {
            // No score change for draw
        } else if (playerWon) {
            multiplayerWins++;
            winCount.textContent = multiplayerWins;
        } else {
            multiplayerLosses++;
            lossCount.textContent = multiplayerLosses;
        }
    }

    // Display result message
    if (isDraw) {
        countdownTimer.textContent = "Draw!";
        multiplayerResultMessage.textContent = result.reason || "It's a draw!";
        multiplayerResultMessage.style.color = "#FFA500"; // Orange/Yellow for draw
    } else if (playerWon) {
        countdownTimer.textContent = "Victory!";
        multiplayerResultMessage.textContent = result.reason || "You win!";
        multiplayerResultMessage.style.color = "#4CAF50";
    } else {
        countdownTimer.textContent = "Defeat!";
        multiplayerResultMessage.textContent = result.reason || "Opponent wins.";
        multiplayerResultMessage.style.color = "#f44336";
    }

    // Add to history only if it doesn't exist
    if (!existingHistoryItem) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item multiplayer-history-item'; // Add specific class
        historyItem.dataset.timestamp = result.timestamp; // Add timestamp for deduping

        let resultText, resultClass;
        if (isDraw) {
            resultText = "DRAW";
            resultClass = "draw"; // Add a CSS class for draws if needed
        } else if (playerWon) {
            resultText = "WIN";
            resultClass = "win";
        } else {
            resultText = "LOSE";
            resultClass = "lose";
        }

        historyItem.innerHTML = `
            <div class="history-player-side">
                 <div class="history-item-emoji">
                     ${playerSide.emoji}
                     ${playerSide.imageUrl ? `<img class="history-item-image" src="${playerSide.imageUrl}" alt="${playerSide.name}">` : '<div class="history-item-image-placeholder"></div>'}
                 </div>
                 <div class="history-item-name">${playerSide.name}</div>
             </div>
             <div class="history-vs">
                <span class="${resultClass}">${resultText}</span>
                VS
                <div class="history-item-reason">${result.reason || ""}</div>
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
    }

    // Reset state for the next round after a delay
    setTimeout(() => {
        // Only reset if the game hasn't been reset by opponent leaving or player cancelling
        if (playerReady && opponentReady) {
            resetMultiplayerStateForNextRound();
            updateReadyStatus(); // Go back to ready prompt and start timer if applicable
        }
    }, 5000); // 5 second delay before resetting UI for next round
}

function resetMultiplayerStateForNextRound() {
    console.log("Resetting for next round");
    // Reset state variables
    isSubmitted = false;
    playerSelection = null;
    opponentSelection = null; // Crucial to reset opponent selection
    clearInterval(countdownInterval);
    countdownInterval = null; // Ensure interval is nullified
    currentBattleResultId = null; // Reset battle ID tracking

    // Reset UI elements
    playerEmojiDisplay.textContent = "❓";
    playerEmojiName.textContent = "...";
    playerImage.src = "";
    playerImage.style.display = "none";
    playerLoadingSpinner.style.display = "none";
    playerImageDisplay.style.backgroundColor = '#f9f9f9'; // Reset background

    opponentEmojiDisplay.textContent = "❓";
    opponentEmojiName.textContent = "...";
    opponentImage.src = "";
    opponentImage.style.display = "none";
    opponentLoadingSpinner.style.display = 'none';
    opponentImageDisplay.style.backgroundColor = '#f9f9f9'; // Reset background

    submissionStatus.textContent = ""; // Clear submission status
    timerDisplay.textContent = ""; // Clear timer
    multiplayerResultMessage.textContent = ""; // Clear result message
    countdownTimer.textContent = ""; // Clear countdown/battle text
    multiplayerInput.value = ""; // Clear input field

    // Re-enable inputs only if both players are still ready
    const enableInputs = playerReady && opponentReady;
    multiplayerInput.disabled = !enableInputs;
    multiplayerSubmitBtn.disabled = !enableInputs;

    // Update presence: player is no longer submitted or readyToReveal
    // Keep 'status' based on whether the 'Ready'/'Cancel' button was active
    if (room) {
        room.updatePresence({
            submitted: false,
            readyToReveal: false,
            // status: playerReady ? 'ready' : 'waiting' // Status is managed by toggleReadyStatus
        });
    }

    // Re-check ready status to potentially restart timer etc.
    // updateReadyStatus(); // Called after this in displayBattleResult timeout and toggleReadyStatus
}

function resetMultiplayerUI() {
    // Full reset for initialization or opponent leaving
    console.log("Performing full UI reset");
    resetMultiplayerStateForNextRound(); // Perform the round reset logic

    // Reset things not covered by round reset
    // playerReady = false; // This is now handled by toggleReadyStatus/initial state
    opponentReady = false;
    multiplayerWins = 0; // Reset scores
    multiplayerLosses = 0;
    winCount.textContent = '0';
    lossCount.textContent = '0';
    multiplayerHistoryList.innerHTML = ''; // Clear history
    multiplayerHistoryList.dataset.lastTimestamp = 0; // Reset timestamp tracking
    opponentStatus.textContent = "Waiting for an opponent...";

    findOpponentBtn.textContent = "Ready"; // Reset button text
    multiplayerSubmitBtn.disabled = true; // Ensure submit is disabled initially
    multiplayerInput.disabled = true;

    // Update presence fully
    if (room) {
        room.updatePresence({
            status: 'waiting', // Assume waiting state on full reset
            submitted: false,
            readyToReveal: false
        });
    }
}

// suggestEmojiForItem remains the same
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
        // Basic validation: check length and potentially character range
        const emoji = completion.content.trim();
        if (emoji.length > 0 && emoji.length <= 4) { // Allow for ZWJ sequences etc.
            return emoji;
        } else {
            console.warn(`LLM suggested invalid emoji: "${emoji}" for item: "${item}"`);
            return "❓";
        }

    } catch (error) {
        console.error("Error suggesting emoji:", error);
        return "❓";
    }
}