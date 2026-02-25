// Configurations
const STORAGE_KEY = 'ai_group_chat_api_key';

const AI_MODELS = {
    chatgpt: { id: 'chatgpt', name: 'ChatGPT', model_id: 'openai/gpt-4o-mini' },
    claude: { id: 'claude', name: 'Claude', model_id: 'anthropic/claude-3-haiku' },
    gemini: { id: 'gemini', name: 'Gemini', model_id: 'google/gemini-flash-1.5' },
    grok: { id: 'grok', name: 'Grok', model_id: 'x-ai/grok-beta' }
};

// State
let openRouterKey = localStorage.getItem(STORAGE_KEY) || '';
let chatHistory = [];
let isGenerating = false;

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
    apiKeyInput: document.getElementById('api-key-input')
};

// Initialize
function init() {
    elements.messageInput.addEventListener('input', handleTextareaResize);
    elements.messageInput.addEventListener('keydown', handleKeyDown);
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.clearChatBtn.addEventListener('click', clearChat);

    // Settings modal
    elements.settingsBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
    elements.closeModalBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.settingsModal.addEventListener('click', (e) => {
        if (e.target === elements.settingsModal) elements.settingsModal.classList.add('hidden');
    });

    if (openRouterKey) elements.apiKeyInput.value = openRouterKey;
}

// UI Helpers
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

// Transcript Logic
function appendToTranscript(role, text, modelKey = null) {
    let html = '';
    const parsedText = marked.parseInline(text.substring(0, 100)) + (text.length > 100 ? '...' : '');

    if (role === 'user') {
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

    // Hide any existing bubbles
    hideAllBubbles();

    // Reset input
    elements.messageInput.value = '';
    elements.messageInput.style.height = 'auto';
    elements.sendBtn.disabled = true;
    isGenerating = true;

    // Add user message to history & transcript
    chatHistory.push({ role: 'user', content });
    appendToTranscript('user', content);

    // Prepare API history
    const apiHistory = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
    }));

    const models = Object.keys(AI_MODELS);

    // Run models sequentially for the roundtable effect
    try {
        let currentHistory = [...apiHistory];

        for (const modelKey of models) {
            setTypingStatus(modelKey, true);

            try {
                // Fetch response using expanding history
                const responseText = await fetchAIResponse(modelKey, currentHistory);

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
                const readingTime = Math.min(Math.max(responseText.length * 20, 2000), 5000);
                await new Promise(resolve => setTimeout(resolve, readingTime));

            } catch (error) {
                console.error(`Error from ${modelKey}:`, error);
                setTypingStatus(modelKey, false);
                showBubble(modelKey, "*System Error: Failed to connect.*");
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } finally {
        isGenerating = false;
        elements.sendBtn.disabled = false;
        elements.messageInput.focus();
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

    const systemPrompt = `You are ${ai.name}, an AI assistant. You are participating in a group chat with a User and other AIs. Keep your responses relatively concise, conversational, and stay in character. Speak naturally as your specific AI persona.`;

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
