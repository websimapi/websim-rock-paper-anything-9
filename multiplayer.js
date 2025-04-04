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

// Initialize Multiplayer Mode
async function initializeMultiplayerMode() {
    if (multiplayerInitialized) return;
    
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

    // Reset UI
    resetMultiplayerUI();
    
    // Initialize WebsimSocket
    room = new WebsimSocket();
    await room.initialize();
    
    connectionStatus.textContent = `Connected as ${room.peers[room.clientId].username}`;
    
    // Subscribe to presence changes
    room.subscribePresence((presence) => {
        const peerCount = Object.keys(room.peers).length;
        if (peerCount > 1) {
            // Get the first peer that isn't ourselves
            const opponentId = Object.keys(room.peers).find(id => id !== room.clientId);
            if (opponentId) {
                opponentStatus.textContent = `Playing against: ${room.peers[opponentId].username}`;
                
                // Check if opponent is ready
                if (room.presence[opponentId] && room.presence[opponentId].status === 'ready') {
                    opponentReady = true;
                    updateReadyStatus();
                } else {
                    opponentReady = false;
                    updateReadyStatus();
                }
                
                // Check if opponent has submitted but don't show their selection yet
                if (room.presence[opponentId] && room.presence[opponentId].submitted) {
                    opponentSubmitted = true;
                    opponentEmojiDisplay.textContent = "✓";
                    opponentEmojiName.textContent = "Submitted";
                    checkBothSubmitted();
                }
            }
        } else {
            opponentStatus.textContent = "Waiting for an opponent...";
            opponentReady = false;
            resetMultiplayerUI();
        }
    });
    
    // Subscribe to room state changes
    room.subscribeRoomState((currentRoomState) => {
        if (currentRoomState.battleResult) {
            const result = currentRoomState.battleResult;
            if (result.completed && result.playerAId && result.playerBId) {
                // Show the battle result if both players are present
                if ((result.playerAId === room.clientId || result.playerBId === room.clientId) && 
                    result.playerASelection && result.playerBSelection) {
                    displayBattleResult(result);
                }
            }
        }
    });
    
    // Subscribe to presence update requests
    room.subscribePresenceUpdateRequests((updateRequest, fromClientId) => {
        if (updateRequest.type === 'challenge' && updateRequest.selection) {
            handleOpponentSelection(updateRequest.selection, fromClientId);
        }
    });
    
    // Handle submission
    multiplayerSubmitBtn.addEventListener('click', handleMultiplayerSubmission);
    multiplayerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleMultiplayerSubmission();
        }
    });
    
    findOpponentBtn.addEventListener('click', toggleReadyStatus);
    
    multiplayerInitialized = true;
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
    
    submissionStatus.textContent = "Submitted!";
    submissionStatus.style.color = "#4CAF50";
    
    // Generate player emoji and image - don't display yet, just prepare
    playerEmojiDisplay.textContent = "✓";
    playerEmojiName.textContent = "Submitted";
    
    try {
        // Find matching emoji or create a new one
        let matchingEmoji = emojis.find(e => e.name.toLowerCase() === userResponse.toLowerCase());
        let userEmoji;
        
        if (matchingEmoji) {
            userEmoji = matchingEmoji;
        } else {
            // Generate emoji suggestion from LLM
            const emojiSuggestion = await suggestEmojiForItem(userResponse);
            userEmoji = {
                emoji: emojiSuggestion || '❓',
                name: userResponse.toLowerCase(),
                imageUrl: ''
            };
        }
        
        // Generate image if needed
        if (!userEmoji.imageUrl) {
            playerLoadingSpinner.style.display = 'block';
            const result = await websim.imageGen({
                prompt: `A detailed illustration of a ${userEmoji.name}, simple clean background, high quality, digital art style`,
                aspect_ratio: "1:1"
            });
            userEmoji.imageUrl = result.url;
            playerLoadingSpinner.style.display = 'none';
        }
        
        // Store selection but don't display yet
        isSubmitted = true;
        playerSelection = {
            emoji: userEmoji.emoji,
            name: userEmoji.name,
            imageUrl: userEmoji.imageUrl
        };
        
        room.updatePresence({
            submitted: true
        });
        
        checkBothSubmitted();
        
    } catch (error) {
        console.error("Error in submission:", error);
        submissionStatus.textContent = "Error generating your item!";
        submissionStatus.style.color = "#f44336";
        playerLoadingSpinner.style.display = 'none';
    }
}

function checkBothSubmitted() {
    if (isSubmitted && opponentSubmitted) {
        submissionStatus.textContent = "Both players submitted! Resolving battle...";
        
        // Get opponent ID
        const opponentId = Object.keys(room.peers).find(id => id !== room.clientId);
        
        if (opponentId) {
            // Send our selection to opponent
            room.requestPresenceUpdate(opponentId, {
                type: 'challenge',
                selection: playerSelection
            });
            
            // Now we can reveal our selection
            playerEmojiDisplay.textContent = playerSelection.emoji;
            playerEmojiName.textContent = playerSelection.name;
            playerImage.src = playerSelection.imageUrl;
            playerImage.style.display = 'block';
            
            // Start battle resolution if we have both selections
            if (playerSelection && opponentSelection) {
                resolveBattle();
            }
        }
    }
}

function handleOpponentSelection(selection, fromClientId) {
    opponentSelection = selection;
    
    // Now we can reveal opponent's selection
    opponentEmojiDisplay.textContent = selection.emoji;
    opponentEmojiName.textContent = selection.name;
    opponentImage.src = selection.imageUrl;
    opponentImage.style.display = 'block';
    
    // Start battle resolution if we have both selections
    if (playerSelection && opponentSelection) {
        resolveBattle();
    }
}

async function resolveBattle() {
    multiplayerResultMessage.textContent = "Determining the winner...";
    countdownTimer.textContent = "Battle!";
    
    try {
        // Check if player selection beats opponent
        const result = await checkIfBeats(playerSelection.name, opponentSelection);
        
        // Create battle result object
        const battleResult = {
            playerAId: room.clientId,
            playerBId: Object.keys(room.peers).find(id => id !== room.clientId),
            playerASelection: playerSelection,
            playerBSelection: opponentSelection,
            playerAWins: result.isWinner,
            reason: result.reason,
            timestamp: Date.now(),
            completed: true
        };
        
        // Update room state with battle result
        room.updateRoomState({
            battleResult: battleResult
        });
        
    } catch (error) {
        console.error("Error resolving battle:", error);
        multiplayerResultMessage.textContent = "Error determining the winner!";
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
    const isPlayerA = result.playerAId === room.clientId;
    const playerWon = isPlayerA ? result.playerAWins : !result.playerAWins;
    
    // Update counters
    if (playerWon) {
        multiplayerWins++;
        winCount.textContent = multiplayerWins;
    } else {
        multiplayerLosses++;
        lossCount.textContent = multiplayerLosses;
    }
    
    // Display result message
    countdownTimer.textContent = playerWon ? "Victory!" : "Defeat!";
    multiplayerResultMessage.textContent = result.reason;
    multiplayerResultMessage.style.color = playerWon ? "#4CAF50" : "#f44336";
    
    // Add to history
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const playerSide = isPlayerA ? result.playerASelection : result.playerBSelection;
    const opponentSide = isPlayerA ? result.playerBSelection : result.playerASelection;
    
    historyItem.innerHTML = `
        <div class="history-item-emoji">
            ${playerSide.emoji}
            ${playerSide.imageUrl ? `<img class="history-item-image" src="${playerSide.imageUrl}" alt="${playerSide.name}">` : ''}
        </div>
        <div class="history-item-text">
            <span class="${playerWon ? 'win' : 'lose'}">${playerWon ? '✓' : '✕'}</span>
            VS ${opponentSide.name} ${opponentSide.emoji}
            ${opponentSide.imageUrl ? `<img class="history-item-image" src="${opponentSide.imageUrl}" alt="${opponentSide.name}">` : ''}
            <div class="history-item-reason">${result.reason}</div>
        </div>
    `;
    
    multiplayerHistoryList.insertBefore(historyItem, multiplayerHistoryList.firstChild);
    
    // Reset for next round
    setTimeout(() => {
        resetMultiplayerUI();
    }, 5000);
}

function resetMultiplayerUI() {
    // Reset state
    isSubmitted = false;
    opponentSubmitted = false;
    playerReady = false;
    opponentReady = false;
    playerSelection = null;
    opponentSelection = null;
    clearInterval(countdownInterval);
    
    // Reset UI
    playerEmojiDisplay.textContent = "❓";
    playerEmojiName.textContent = "...";
    playerImage.src = "";
    playerImage.style.display = "none";
    playerLoadingSpinner.style.display = "none";
    
    opponentEmojiDisplay.textContent = "❓";
    opponentEmojiName.textContent = "...";
    opponentImage.src = "";
    opponentImage.style.display = "none";
    
    submissionStatus.textContent = "";
    timerDisplay.textContent = "";
    multiplayerResultMessage.textContent = "";
    countdownTimer.textContent = "";
    multiplayerInput.value = "";
    findOpponentBtn.textContent = "Ready";
    
    // Update presence
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