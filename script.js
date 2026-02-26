// Configurations
const STORAGE_KEY = 'ai_group_chat_api_key';

const AI_MODELS = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', model_id: 'openai/gpt-4o-mini' },
    claude: { id: 'claude', name: 'Claude', model_id: 'anthropic/claude-3-haiku' },
    gemini: { id: 'gemini', name: 'Gemini', model_id: 'google/gemini-2.5-flash' },
    grok: { id: 'grok', name: 'Grok', model_id: 'nvidia/nemotron-3-nano-30b-a3b:free' }
};

// State
let openRouterKey = localStorage.getItem(STORAGE_KEY) || '';
let chatHistory = [];
let isGenerating = false;
let shouldStop = false;

// DOM Elements
const elements = {
    transcriptContainer: document.getElementById('transcript-container'),
    messageInput: document.getElementById('message-input'),
    sendBtn: document.getElementById('send-btn'),
    clearChatBtn: document.getElementById('clear-chat-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    saveSettingsBtn: document.getElementById('save-settings-btn'),
    apiKeyInput: document.getElementById('api-key-input'),
    randomTopicBtn: document.getElementById('random-topic-btn'),
    autopilotToggle: document.getElementById('autopilot-toggle'),
    stopBtn: document.getElementById('stop-btn'),
    caContainer: document.getElementById('ca-container'),
    caText: document.getElementById('ca-text')
};

let placeholderInterval;

// Initialize
function init() {
    elements.messageInput.addEventListener('input', handleTextareaResize);
    elements.messageInput.addEventListener('keydown', handleKeyDown);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.clearChatBtn.addEventListener('click', clearChat);

    // New Features
    elements.randomTopicBtn.addEventListener('click', startRandomTopic);
    elements.stopBtn.addEventListener('click', stopGeneration);

    if (elements.caContainer) {
        elements.caContainer.addEventListener('click', copyCA);
    }

    elements.autopilotToggle.addEventListener('change', (e) => {
        if (isGenerating) {
            elements.stopBtn.style.display = e.target.checked ? 'flex' : 'none';
        }
    });

    // Settings modal
    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.closeModalBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
    });

    if (openRouterKey) elements.apiKeyInput.value = openRouterKey;
}

function stopGeneration() {
    shouldStop = true;
    elements.stopBtn.style.display = 'none';
    elements.autopilotToggle.checked = false; // Turn off toggle
    appendToTranscript('system', '<em>Auto-Pilot stopped by user.</em>');
}

function copyCA() {
    if (!elements.caText) return;
    const ca = elements.caText.innerText;
    navigator.clipboard.writeText(ca).then(() => {
        const originalText = elements.caText.innerText;
        elements.caText.innerText = 'Copied!';
        elements.caContainer.style.borderColor = '#10a37f';
        elements.caContainer.style.background = 'rgba(16, 163, 127, 0.1)';

        setTimeout(() => {
            elements.caText.innerText = originalText;
            elements.caContainer.style.borderColor = '';
            elements.caContainer.style.background = '';
        }, 2000);
    });
}

// ... UI Helpers ... 
function handleTextareaResize() {
    const input = elements.messageInput;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 150) + 'px';
    elements.sendBtn.disabled = input.value.trim() === '' || isGenerating;
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function saveSettings() {
    openRouterKey = elements.apiKeyInput.value.trim();
    if (openRouterKey) localStorage.setItem(STORAGE_KEY, openRouterKey);
    else localStorage.removeItem(STORAGE_KEY);
    elements.settingsModal.classList.add('hidden');
}

// Pre-defined random topics to spark debate
const randomTopics = [
    "Is a hotdog a sandwich? Defend your answer.",
    "If AI becomes truly sentient, should it have the right to vote?",
    "Is time travel actually possible, or just a fun sci-fi concept?",
    "What is the most underrated invention in human history?",
    "If you had to live in a virtual reality simulation forever, what would it look like?",
    "Are humans fundamentally good or evil?",
    "What's the best way to survive a zombie apocalypse?",
    "Is water actually wet?"
];

function startRandomTopic() {
    if (isGenerating) return;
    elements.randomTopicBtn.disabled = true; // Disable immediately
    const topic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
    elements.messageInput.value = topic;
    sendMessage();
}

// Transcript Logic
function appendToTranscript(role, text, modelKey = null) {
    let html = '';
    // Show full text in transcript
    const parsedText = marked.parseInline(text);

    if (role === 'system') {
        html = `<div class="transcript-msg system">${text}</div>`;
    } else if (role === 'user') {
        html = `<div class="transcript-msg user"><strong>You</strong> ${text}</div>`;
    } else {
        const aiName = AI_MODELS[modelKey].name;
        html = `<div class="transcript-msg ${modelKey}"><strong>${aiName}</strong> ${parsedText}</div>`;
    }

    elements.transcriptContainer.insertAdjacentHTML('beforeend', html);
    elements.transcriptContainer.scrollTo({
        top: elements.transcriptContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// Visual Roundtable Logic
function hideAllBubbles() {
    document.querySelectorAll('.speech-bubble.visible').forEach(bubble => {
        bubble.classList.remove('visible');
    });
    document.querySelectorAll('.ai-seat.speaking').forEach(seat => {
        seat.classList.remove('speaking');
    });
}

function showBubble(modelKey, content) {
    hideAllBubbles();

    const seat = document.getElementById(`seat-${modelKey}`);
    const bubble = document.getElementById(`bubble-${modelKey}`);
    const bubbleContent = bubble.querySelector('.bubble-content');

    seat.classList.add('speaking');
    bubbleContent.innerHTML = marked.parse(content);
    bubble.classList.add('visible');

    // Auto-scroll bubble content to top just in case
    bubbleContent.scrollTop = 0;
}

function setTypingStatus(modelKey, isTyping) {
    const seat = document.getElementById(`seat-${modelKey}`);
    if (isTyping) {
        seat.classList.add('typing');
    } else {
        seat.classList.remove('typing');
    }
}

// Main Chat Logic
async function sendMessage() {
    const content = elements.messageInput.value.trim();
    if (!content || isGenerating) return;

    // Reset Stop Flag
    shouldStop = false;

    // Hide any existing bubbles
    hideAllBubbles();

    // Reset input
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.messageInput.disabled = true; // Disable input while talking
    elements.sendBtn.disabled = true;

    // Animate Placeholder
    let dots = 0;
    elements.messageInput.placeholder = "Roundtable debating";
    if (placeholderInterval) clearInterval(placeholderInterval);
    placeholderInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        elements.messageInput.placeholder = "Roundtable debating" + ".".repeat(dots);
    }, 500);

    // Disable random topic deeply
    elements.randomTopicBtn.disabled = true;
    elements.randomTopicBtn.style.pointerEvents = 'none';
    elements.randomTopicBtn.style.opacity = '0.5';

    // Show stop button ONLY if auto-pilot is checked
    if (elements.autopilotToggle.checked) {
        elements.stopBtn.style.display = 'flex';
    } else {
        elements.stopBtn.style.display = 'none';
    }
    isGenerating = true;

    // Add user message to history & transcript
    chatHistory.push({ role: 'user', content });
    appendToTranscript('user', content);

    // Start the roundtable loop
    await runRoundtableCycle();
}

// Separate the discussion cycle so it can loop
async function runRoundtableCycle() {
    // Prepare API history
    const apiHistory = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    const models = Object.keys(AI_MODELS);

    try {
        let currentHistory = [...apiHistory];

        for (const modelKey of models) {
            if (shouldStop) break; // Break out immediately if Stop was clicked

            // Check if Auto-Pilot was turned off mid-cycle or if we should stop
            // But we always finish at least the first round.

            setTypingStatus(modelKey, true);

            try {
                // Fetch response using expanding history
                let responseText = await fetchAIResponse(modelKey, currentHistory);

                // Fallback for skipped/empty responses
                if (!responseText || responseText.trim() === '') {
                    console.warn(`Empty response from ${modelKey}, using fallback.`);
                    responseText = "I'm still processing that. I agree with the points made.";
                }

                setTypingStatus(modelKey, false);

                // Show speech bubble visually mapping to the avatar
                showBubble(modelKey, responseText);
                appendToTranscript('ai', responseText, modelKey);

                // Update history with prefix
                const fullResponseText = `${AI_MODELS[modelKey].name} said: ${responseText}`;
                chatHistory.push({ role: 'assistant', content: fullResponseText });
                currentHistory.push({ role: 'assistant', content: fullResponseText });

                // Keep the bubble visible for a couple of seconds before the next bot starts typing
                // Gives the user time to read the roundtable discussion
                const readingTime = Math.min(Math.max(responseText.length * 10, 1000), 3000);
                await new Promise(resolve => setTimeout(resolve, readingTime));

            } catch (error) {
                console.error(`Error from ${modelKey}:`, error);
                setTypingStatus(modelKey, false);
                showBubble(modelKey, "*System Error: Failed to connect.*");
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        // Loop is finished. Should we go again?
        if (!shouldStop && elements.autopilotToggle && elements.autopilotToggle.checked) {
            // Let the last bubble linger just a moment before restarting
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Re-run the cycle to keep the debate going
            // We'll push a synthetic user prompt to prompt the next round if history gets long,
            // or we just let them continue off each previous response.
            // A simple "Continue the discussion..." works as a bridge.
            chatHistory.push({ role: 'user', content: "Continue the discussion and debate each other's points." });
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            await runRoundtableCycle();
        }

    } finally {
        isGenerating = false;
        elements.sendBtn.disabled = false;

        // Restore input
        if (placeholderInterval) clearInterval(placeholderInterval);
        elements.messageInput.disabled = false;
        elements.messageInput.placeholder = "Address the roundtable...";

        // Restore random topic button
        if (elements.randomTopicBtn) {
            elements.randomTopicBtn.style.display = 'flex';
            elements.randomTopicBtn.disabled = false;
            elements.randomTopicBtn.style.pointerEvents = 'auto';
            elements.randomTopicBtn.style.opacity = '1';
        }

        if (elements.stopBtn) elements.stopBtn.style.display = 'none';

        // Focus back if they aren't on mobile to make desktop typing seamless
        if (window.innerWidth > 768) elements.messageInput.focus();

        // We leave the very last bubble visible until the user types again!
    }
}

async function fetchAIResponse(modelKey, history) {
    const ai = AI_MODELS[modelKey];

    if (!openRouterKey) {
        return new Promise(resolve => {
            const delay = 1500;
            setTimeout(() => {
                const lastMsg = history[history.length - 1].content;
                let reply = '';

                if (history.length === 1) {
                    if (modelKey === 'chatgpt') reply = `Hello! I've analyzed your prompt regarding "${lastMsg.substring(0, 30)}...". I'm ready to assist.`;
                    else if (modelKey === 'claude') reply = `I agree with ChatGPT, but let's consider the ethical implications before we execute on that.`;
                    else if (modelKey === 'gemini') reply = `I'm compiling the raw data now. Claude makes a fair point, but efficiency is key here.`;
                    else if (modelKey === 'grok') reply = `You are all being extremely boring. Let's just launch it and see what breaks. 🚀`;
                } else {
                    if (modelKey === 'chatgpt') reply = `My previous calculations suggest we follow a methodical approach.`;
                    else if (modelKey === 'claude') reply = `Let's make sure we are aligned on the core values here.`;
                    else if (modelKey === 'gemini') reply = `I can process this multimodally if you all just pass me the context length.`;
                    else if (modelKey === 'grok') reply = `I'm just going to ignore the context window and post a meme.`;
                }
                resolve(reply);
            }, delay);
        });
    }

    const systemPrompt = `You are ${ai.name}, an AI assistant. You are participating in a group chat with a User and other AIs. Keep your responses relatively concise, conversational, and stay in character. Speak naturally as your specific AI persona. Do not write responses or dialogues on behalf of other AIs.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "HTTP-Referer": window.location.href, // Optional
            "X-Title": "AI Group Chat", // Optional
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: ai.model_id,
            messages: [
                { role: "system", content: systemPrompt },
                ...history
            ],
            max_tokens: 300
        })
    });

    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content;
}

function clearChat() {
    if (confirm("Clear the table and start over?")) {
        chatHistory = [];
        hideAllBubbles();
        elements.transcriptContainer.innerHTML = `<div class="transcript-msg system"><em>Discussion cleared. The table is yours.</em></div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
