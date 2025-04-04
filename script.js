document.addEventListener('DOMContentLoaded', () => {
    // Initial list of emojis with their names
    const emojis = [
        { emoji: '🪨', name: 'rock', imageUrl: '' },
        { emoji: '📄', name: 'paper', imageUrl: '' },
        { emoji: '✂️', name: 'scissors', imageUrl: '' },
        { emoji: '🔥', name: 'fire', imageUrl: '' },
        { emoji: '💧', name: 'water', imageUrl: '' },
        { emoji: '🌪️', name: 'tornado', imageUrl: '' },
        { emoji: '🌵', name: 'cactus', imageUrl: '' },
        { emoji: '🧙‍♂️', name: 'wizard', imageUrl: '' },
        { emoji: '🐉', name: 'dragon', imageUrl: '' },
        { emoji: '🗡️', name: 'sword', imageUrl: '' },
        { emoji: '🛡️', name: 'shield', imageUrl: '' },
        { emoji: '🧸', name: 'teddy bear', imageUrl: '' },
        { emoji: '🦈', name: 'shark', imageUrl: '' },
        { emoji: '🦖', name: 'dinosaur', imageUrl: '' },
        { emoji: '🚀', name: 'rocket', imageUrl: '' },
        { emoji: '🌞', name: 'sun', imageUrl: '' },
        { emoji: '🌚', name: 'moon', imageUrl: '' },
        { emoji: '⚡', name: 'lightning', imageUrl: '' },
        { emoji: '🌈', name: 'rainbow', imageUrl: '' },
        { emoji: '🧊', name: 'ice', imageUrl: '' }
    ];

    // Game state
    let currentEmoji = emojis[Math.floor(Math.random() * emojis.length)]; // Randomly select initial emoji
    let winningStreak = 0;
    let conversationHistory = [];

    // DOM elements
    const currentEmojiDisplay = document.getElementById('current-emoji-display');
    const currentEmojiName = document.getElementById('current-emoji-name');
    const currentImage = document.getElementById('current-image');
    const currentLoadingSpinner = document.getElementById('current-loading-spinner');
    const userInput = document.getElementById('user-input');
    const submitBtn = document.getElementById('submit-btn');
    const resultMessage = document.getElementById('result-message');
    const streakCount = document.getElementById('streak-count');
    const emojiGrid = document.getElementById('emoji-grid');
    const historyList = document.getElementById('history-list');

    // Set initial emoji
    currentEmojiDisplay.textContent = currentEmoji.emoji;
    currentEmojiName.textContent = currentEmoji.name;
    generateImageForEmoji(currentEmoji);

    // Generate and set image for initial emoji
    async function generateImageForEmoji(emojiObj) {
        if (!emojiObj.imageUrl) {
            try {
                currentLoadingSpinner.style.display = 'block';
                const result = await websim.imageGen({
                    prompt: `A detailed illustration of a ${emojiObj.name}, simple clean background, high quality, digital art style`,
                    aspect_ratio: "1:1"
                });
                emojiObj.imageUrl = result.url;
            } catch (error) {
                console.error("Error generating image:", error);
                emojiObj.imageUrl = '';
            } finally {
                currentLoadingSpinner.style.display = 'none';
            }
        }
        
        currentImage.src = emojiObj.imageUrl || '';
        currentImage.style.display = emojiObj.imageUrl ? 'block' : 'none';
    }

    // Populate emoji grid
    emojis.forEach(emojiObj => {
        const emojiItem = document.createElement('div');
        emojiItem.className = 'emoji-item';
        emojiItem.textContent = emojiObj.emoji;
        emojiItem.title = emojiObj.name;
        emojiItem.addEventListener('click', () => {
            userInput.value = emojiObj.name;
        });
        emojiGrid.appendChild(emojiItem);
    });

    // Handle user submission
    submitBtn.addEventListener('click', handleSubmission);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSubmission();
        }
    });

    async function handleSubmission() {
        const userResponse = userInput.value.trim();
        
        if (!userResponse) {
            resultMessage.textContent = "Please enter something that would beat the current emoji!";
            resultMessage.style.color = "#f44336";
            return;
        }

        resultMessage.textContent = "Thinking...";
        resultMessage.style.color = "#333";

        try {
            const result = await checkIfBeats(userResponse, currentEmoji);
            
            if (result.isWinner) {
                winningStreak++;
                resultMessage.textContent = `Yes! ${userResponse} beats ${currentEmoji.name}! ${result.reason}`;
                resultMessage.style.color = "#4CAF50";
                
                // Find or add the emoji
                const matchingEmoji = emojis.find(e => e.name.toLowerCase() === userResponse.toLowerCase());
                let nextEmoji;
                
                if (matchingEmoji) {
                    nextEmoji = matchingEmoji;
                } else if (result.suggestedEmoji) {
                    nextEmoji = {
                        emoji: result.suggestedEmoji,
                        name: userResponse.toLowerCase(),
                        imageUrl: ''
                    };
                    emojis.push(nextEmoji);
                    
                    // Add to emoji grid
                    const emojiItem = document.createElement('div');
                    emojiItem.className = 'emoji-item';
                    emojiItem.textContent = nextEmoji.emoji;
                    emojiItem.title = nextEmoji.name;
                    emojiItem.addEventListener('click', () => {
                        userInput.value = nextEmoji.name;
                    });
                    emojiGrid.appendChild(emojiItem);
                } else {
                    nextEmoji = {
                        emoji: '❓',
                        name: userResponse.toLowerCase(),
                        imageUrl: ''
                    };
                }
                
                // Generate image for the new emoji if it doesn't have one
                await generateImageForEmoji(nextEmoji);
                
                // Add to history
                addToHistory(currentEmoji, nextEmoji, true);
                
                // Set as new challenge
                currentEmoji = nextEmoji;
                currentEmojiDisplay.textContent = currentEmoji.emoji;
                currentEmojiName.textContent = currentEmoji.name;
                currentImage.src = currentEmoji.imageUrl || '';
                currentImage.style.display = currentEmoji.imageUrl ? 'block' : 'none';
            } else {
                winningStreak = 0;
                resultMessage.textContent = `Sorry! ${userResponse} doesn't beat ${currentEmoji.name}. ${result.reason}`;
                resultMessage.style.color = "#f44336";
                
                // Create a temporary object for the challenger that didn't win
                const tempChallenger = {
                    emoji: '❌',
                    name: userResponse,
                    imageUrl: ''
                };
                
                // Add to history with no matching emoji
                addToHistory(currentEmoji, tempChallenger, false);
            }
            
            streakCount.textContent = winningStreak;
            userInput.value = '';
            
        } catch (error) {
            console.error("Error:", error);
            resultMessage.textContent = "Oops! Something went wrong. Please try again.";
            resultMessage.style.color = "#f44336";
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

        // Create a new message
        const newMessage = {
            role: "user",
            content: `Defending: ${defending.name} (${defending.emoji})
Challenger: ${challenger}
Is the challenger the winner? Why or why not?`
        };
        
        // Add to conversation history
        conversationHistory.push(newMessage);
        // Keep only the last 10 messages
        conversationHistory = conversationHistory.slice(-10);
        
        // Send to LLM
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                },
                ...conversationHistory
            ],
            json: true
        });
        
        try {
            const result = JSON.parse(completion.content);
            
            // Add the response to conversation history
            conversationHistory.push({
                role: "assistant",
                content: completion.content
            });
            
            return result;
        } catch (error) {
            console.error("Error parsing LLM response:", error);
            throw new Error("Failed to get a valid response");
        }
    }

    function addToHistory(defending, challenger, wasSuccessful) {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        
        const result = wasSuccessful ? 'win' : 'lose';
        const reasonText = resultMessage.textContent.split(wasSuccessful ? `Yes! ${challenger.name} beats ${defending.name}! ` : `Sorry! ${challenger.name} doesn't beat ${defending.name}. `)[1] || '';
        
        historyItem.innerHTML = `
            <div class="history-item-emoji">
                ${defending.emoji}
                ${defending.imageUrl ? `<img class="history-item-image" src="${defending.imageUrl}" alt="${defending.name}">` : ''}
            </div>
            <div class="history-item-text">
                <span class="${result}">${wasSuccessful ? '✓' : '✕'}</span>
                ${challenger.name} ${challenger.emoji}
                ${challenger.imageUrl ? `<img class="history-item-image" src="${challenger.imageUrl}" alt="${challenger.name}">` : ''}
                <div class="history-item-reason">${reasonText}</div>
            </div>
        `;
        
        historyList.insertBefore(historyItem, historyList.firstChild);
    }

    // Mode switching
    const singlePlayerBtn = document.getElementById('single-player-btn');
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const singlePlayerMode = document.getElementById('single-player-mode');
    const multiplayerMode = document.getElementById('multiplayer-mode');

    singlePlayerBtn.addEventListener('click', () => {
        singlePlayerBtn.classList.add('active');
        multiplayerBtn.classList.remove('active');
        singlePlayerMode.classList.add('active');
        multiplayerMode.classList.remove('active');
    });

    multiplayerBtn.addEventListener('click', () => {
        multiplayerBtn.classList.add('active');
        singlePlayerBtn.classList.remove('active');
        multiplayerMode.classList.add('active');
        singlePlayerMode.classList.remove('active');
        initializeMultiplayerMode();
    });

    // Initialize Multiplayer Mode
    let room;
    let multiplayerInitialized = false;
    let multiplayerWins = 0;
    let multiplayerLosses = 0;
    let isSubmitted = false;
    let opponentSubmitted = false;
    let playerSelection = null;
    let opponentSelection = null;
    let countdownInterval = null;
    let timeRemaining = 10;

    // Multiplayer DOM elements
    const findOpponentBtn = document.getElementById('find-opponent-btn');
    const connectionStatus = document.getElementById('connection-status');
    const opponentStatus = document.getElementById('opponent-status');
    const playerEmojiDisplay = document.getElementById('player-emoji-display');
    const playerEmojiName = document.getElementById('player-emoji-name');
    const playerImage = document.getElementById('player-image');
    const playerLoadingSpinner = document.getElementById('player-loading-spinner');
    const opponentEmojiDisplay = document.getElementById('opponent-emoji-display');
    const opponentEmojiName = document.getElementById('opponent-emoji-name');
    const opponentImage = document.getElementById('opponent-image');
    const multiplayerInput = document.getElementById('multiplayer-input');
    const multiplayerSubmitBtn = document.getElementById('multiplayer-submit-btn');
    const submissionStatus = document.getElementById('submission-status');
    const timerDisplay = document.getElementById('timer-display');
    const countdownTimer = document.getElementById('countdown-timer');
    const multiplayerResultMessage = document.getElementById('multiplayer-result-message');
    const winCount = document.getElementById('win-count');
    const lossCount = document.getElementById('loss-count');
    const multiplayerEmojiGrid = document.getElementById('multiplayer-emoji-grid');
    const multiplayerHistoryList = document.getElementById('multiplayer-history-list');

    async function initializeMultiplayerMode() {
        if (multiplayerInitialized) return;
        
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
                    
                    // Check if opponent has submitted
                    if (room.presence[opponentId] && room.presence[opponentId].submitted) {
                        opponentSubmitted = true;
                        checkBothSubmitted();
                    }
                }
            } else {
                opponentStatus.textContent = "Waiting for an opponent...";
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
        
        findOpponentBtn.addEventListener('click', findOpponent);
        
        multiplayerInitialized = true;
    }
    
    function findOpponent() {
        resetMultiplayerUI();
        startCountdown();
        room.updatePresence({
            status: 'ready',
            submitted: false
        });
    }
    
    function startCountdown() {
        timeRemaining = 10;
        clearInterval(countdownInterval);
        
        timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;
        countdownInterval = setInterval(() => {
            timeRemaining--;
            timerDisplay.textContent = `Time remaining: ${timeRemaining}s`;
            
            if (timeRemaining <= 0) {
                clearInterval(countdownInterval);
                // Auto-submit if time runs out
                if (!isSubmitted) {
                    handleMultiplayerSubmission(true);
                }
            }
        }, 1000);
    }
    
    async function handleMultiplayerSubmission(isAuto = false) {
        const userResponse = multiplayerInput.value.trim();
        
        if (!userResponse && !isAuto) {
            submissionStatus.textContent = "Please enter something!";
            submissionStatus.style.color = "#f44336";
            return;
        }
        
        // Clear countdown
        clearInterval(countdownInterval);
        
        submissionStatus.textContent = isAuto ? "Time's up! Auto-submitted." : "Submitted!";
        submissionStatus.style.color = "#4CAF50";
        
        // Generate player emoji and image
        playerEmojiDisplay.textContent = "⏳";
        playerEmojiName.textContent = "Generating...";
        playerLoadingSpinner.style.display = 'block';
        playerImage.style.display = 'none';
        
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
                const result = await websim.imageGen({
                    prompt: `A detailed illustration of a ${userEmoji.name}, simple clean background, high quality, digital art style`,
                    aspect_ratio: "1:1"
                });
                userEmoji.imageUrl = result.url;
            }
            
            // Update UI with selection
            playerEmojiDisplay.textContent = userEmoji.emoji;
            playerEmojiName.textContent = userEmoji.name;
            playerImage.src = userEmoji.imageUrl;
            playerImage.style.display = 'block';
            playerLoadingSpinner.style.display = 'none';
            
            // Mark as submitted
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
                
                // Start battle resolution if we have both selections
                if (playerSelection && opponentSelection) {
                    resolveBattle();
                }
            }
        }
    }
    
    function handleOpponentSelection(selection, fromClientId) {
        opponentSelection = selection;
        
        // Update UI
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
            const playerResult = await checkIfBeats(playerSelection.name, opponentSelection);
            
            // Create battle result object
            const battleResult = {
                playerAId: room.clientId,
                playerBId: Object.keys(room.peers).find(id => id !== room.clientId),
                playerASelection: playerSelection,
                playerBSelection: opponentSelection,
                playerAWins: playerResult.isWinner,
                reason: playerResult.reason,
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
});