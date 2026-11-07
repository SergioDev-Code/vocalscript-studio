/**
 * VocalScript Studio - Core Engine
 * Handcrafted for Edge & Chromium browsers using Web Speech API & MediaRecorder
 */

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const languageSelect = document.getElementById('languageSelect');
    const statusBadge = document.getElementById('statusBadge');
    const statusText = document.getElementById('statusText');
    const timerDisplay = document.getElementById('timerDisplay');
    const visualizerPlaceholder = document.getElementById('visualizerPlaceholder');
    
    // Control Buttons
    const btnRecord = document.getElementById('btnRecord');
    const btnPause = document.getElementById('btnPause');
    const btnStop = document.getElementById('btnStop');
    const btnClear = document.getElementById('btnClear');
    
    // Live Stats
    const statWords = document.getElementById('statWords');
    const statChars = document.getElementById('statChars');
    const statWpm = document.getElementById('statWpm');
    
    // Transcript Elements
    const searchInput = document.getElementById('searchInput');
    const btnCopyText = document.getElementById('btnCopyText');
    const btnViewText = document.getElementById('btnViewText');
    const btnViewTimeline = document.getElementById('btnViewTimeline');
    const interimBanner = document.getElementById('interimBanner');
    const interimText = document.getElementById('interimText');
    const transcriptTextarea = document.getElementById('transcriptTextarea');
    const textViewContainer = document.getElementById('textViewContainer');
    const timelineViewContainer = document.getElementById('timelineViewContainer');
    const timelineList = document.getElementById('timelineList');
    const timelineEmpty = document.getElementById('timelineEmpty');
    
    // Audio Player & Downloads
    const audioPlayback = document.getElementById('audioPlayback');
    const audioPlaceholder = document.getElementById('audioPlaceholder');
    const btnDownloadAudioWebm = document.getElementById('btnDownloadAudioWebm');
    const btnDownloadAudioWav = document.getElementById('btnDownloadAudioWav');
    const btnDownloadTxt = document.getElementById('btnDownloadTxt');
    const btnDownloadMd = document.getElementById('btnDownloadMd');
    const btnDownloadJson = document.getElementById('btnDownloadJson');
    const toastNotification = document.getElementById('toastNotification');
    const toastMessage = document.getElementById('toastMessage');

    // Visualizer Canvas
    const canvas = document.getElementById('audioVisualizer');
    const canvasCtx = canvas.getContext('2d');

    // State Variables
    let isRecording = false;
    let isPaused = false;
    let recognition = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let recordedAudioBlob = null;
    let audioContext = null;
    let analyser = null;
    let mediaStream = null;
    let animFrameId = null;

    // Timer Variables
    let timerInterval = null;
    let secondsElapsed = 0;

    // Transcript Data Structures
    let finalTranscript = '';
    let timelineEntries = []; // { timestamp, text }

    // Initialize Web Speech API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        showToast('Tu navegador no soporta Web Speech API. Usa Microsoft Edge o Chrome.', 'error');
        btnRecord.disabled = true;
        statusText.textContent = 'API no disponible';
        return;
    }

    function setupSpeechRecognition() {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = languageSelect.value;

        recognition.onstart = () => {
            console.log('Speech recognition started.');
        };

        recognition.onresult = (event) => {
            let interimTranscriptStr = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcriptItem = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    const trimmed = transcriptItem.trim();
                    if (trimmed.length > 0) {
                        const formattedText = capitalizeSentence(trimmed);
                        finalTranscript += (finalTranscript ? ' ' : '') + formattedText + '.';
                        
                        // Add to timeline entries
                        const timestamp = formatTimer(secondsElapsed);
                        timelineEntries.push({ timestamp, text: formattedText + '.' });
                        renderTimeline();
                    }
                } else {
                    interimTranscriptStr += transcriptItem;
                }
            }

            // Update Textarea view
            transcriptTextarea.value = finalTranscript;
            updateStats();
            updateDownloadState();

            // Update interim banner
            if (interimTranscriptStr.trim()) {
                interimBanner.classList.remove('hidden');
                interimText.textContent = `Escuchando: "${interimTranscriptStr}"`;
            } else {
                interimBanner.classList.add('hidden');
            }
        };

        recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                showToast('Permiso de micrófono denegado.', 'error');
                stopRecording();
            }
        };

        recognition.onend = () => {
            // Auto restart if still recording (prevents speech engine timeout)
            if (isRecording && !isPaused) {
                try {
                    recognition.start();
                } catch (e) {
                    console.log('Recognition restart skipped:', e);
                }
            }
        };
    }

    setupSpeechRecognition();

    // Language Change Listener
    languageSelect.addEventListener('change', () => {
        if (recognition) {
            recognition.lang = languageSelect.value;
            if (isRecording && !isPaused) {
                recognition.stop();
            }
            showToast(`Idioma cambiado a: ${languageSelect.options[languageSelect.selectedIndex].text}`);
        }
    });

    // Start Recording
    async function startRecording() {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Initialize AudioContext & Visualizer
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(mediaStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            // Initialize MediaRecorder
            audioChunks = [];
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            
            mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: mimeType });
                const audioUrl = URL.createObjectURL(recordedAudioBlob);
                audioPlayback.src = audioUrl;
                audioPlayback.style.display = 'block';
                audioPlaceholder.classList.add('hidden');
                btnDownloadAudioWebm.disabled = false;
                btnDownloadAudioWav.disabled = false;
            };

            // Start engines
            mediaRecorder.start(250); // collect 250ms chunks
            recognition.start();

            isRecording = true;
            isPaused = false;

            // UI Updates
            statusBadge.className = 'status-pill recording';
            statusText.textContent = 'Grabando y Transcribiendo...';
            visualizerPlaceholder.classList.add('hidden');
            
            btnRecord.classList.add('recording');
            btnRecord.querySelector('span').textContent = 'Grabando...';
            btnRecord.disabled = true;
            btnPause.disabled = false;
            btnStop.disabled = false;

            startTimer();
            drawVisualizer();

            showToast('Grabación y transcripción iniciadas');
        } catch (err) {
            console.error('Error accessing microphone:', err);
            showToast('Error al acceder al micrófono. Por favor permite el acceso.', 'error');
        }
    }

    // Pause Recording
    function pauseRecording() {
        if (!isRecording) return;

        if (!isPaused) {
            // Pause
            isPaused = true;
            if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.pause();
            if (recognition) recognition.stop();
            pauseTimer();

            statusBadge.className = 'status-pill paused';
            statusText.textContent = 'Grabación en pausa';
            btnPause.querySelector('span').textContent = 'Reanudar';
            btnPause.querySelector('i').className = 'fa-solid fa-play';
            interimBanner.classList.add('hidden');
            showToast('Grabación pausada');
        } else {
            // Resume
            isPaused = false;
            if (mediaRecorder && mediaRecorder.state === 'paused') mediaRecorder.resume();
            if (recognition) {
                try { recognition.start(); } catch (e) {}
            }
            resumeTimer();

            statusBadge.className = 'status-pill recording';
            statusText.textContent = 'Grabando y Transcribiendo...';
            btnPause.querySelector('span').textContent = 'Pausar';
            btnPause.querySelector('i').className = 'fa-solid fa-pause';
            showToast('Grabación reanudada');
        }
    }

    // Stop Recording
    function stopRecording() {
        if (!isRecording) return;

        isRecording = false;
        isPaused = false;

        if (recognition) recognition.stop();
        if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }

        stopTimer();
        if (animFrameId) cancelAnimationFrame(animFrameId);
        clearCanvas();

        // UI Reset
        statusBadge.className = 'status-pill';
        statusText.textContent = 'Grabación finalizada';
        visualizerPlaceholder.classList.remove('hidden');

        btnRecord.classList.remove('recording');
        btnRecord.querySelector('span').textContent = 'Iniciar Grabación';
        btnRecord.disabled = false;
        btnPause.disabled = true;
        btnPause.querySelector('span').textContent = 'Pausar';
        btnPause.querySelector('i').className = 'fa-solid fa-pause';
        btnStop.disabled = true;
        interimBanner.classList.add('hidden');

        showToast('Grabación finalizada. Tu audio y texto están listos.');
    }

    // Clear All Data
    function clearAll() {
        if (isRecording) {
            if (!confirm('¿Deseas detener y borrar la grabación actual?')) return;
            stopRecording();
        }

        finalTranscript = '';
        timelineEntries = [];
        transcriptTextarea.value = '';
        audioChunks = [];
        recordedAudioBlob = null;
        audioPlayback.removeAttribute('src');
        audioPlayback.load();
        audioPlaceholder.classList.remove('hidden');

        secondsElapsed = 0;
        timerDisplay.textContent = '00:00:00';
        
        statWords.textContent = '0';
        statChars.textContent = '0';
        statWpm.textContent = '0 PPM';

        renderTimeline();
        updateDownloadState();
        showToast('Se han limpiado todos los datos.');
    }

    // Audio Visualizer Drawing Loop
    function drawVisualizer() {
        if (!canvasCtx || !analyser) return;

        const width = canvas.width = canvas.parentElement.clientWidth;
        const height = canvas.height = canvas.parentElement.clientHeight;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function renderFrame() {
            if (!isRecording || isPaused) {
                clearCanvas();
                return;
            }

            animFrameId = requestAnimationFrame(renderFrame);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.clearRect(0, 0, width, height);

            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * height * 0.85;

                // Create sleek cyan/purple dynamic gradient
                const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
                gradient.addColorStop(0, '#00f2fe');
                gradient.addColorStop(0.5, '#7928ca');
                gradient.addColorStop(1, '#ff0080');

                canvasCtx.fillStyle = gradient;
                canvasCtx.shadowColor = '#00f2fe';
                canvasCtx.shadowBlur = 8;
                canvasCtx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

                x += barWidth;
            }
        }

        renderFrame();
    }

    function clearCanvas() {
        if (canvasCtx && canvas) {
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    // Timer Functions
    function startTimer() {
        secondsElapsed = 0;
        timerDisplay.textContent = '00:00:00';
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            secondsElapsed++;
            timerDisplay.textContent = formatTimer(secondsElapsed);
            updateStats();
        }, 1000);
    }

    function pauseTimer() {
        clearInterval(timerInterval);
    }

    function resumeTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            secondsElapsed++;
            timerDisplay.textContent = formatTimer(secondsElapsed);
            updateStats();
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    function formatTimer(totalSeconds) {
        const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const secs = (totalSeconds % 60).toString().padStart(2, '0');
        return `${hrs}:${mins}:${secs}`;
    }

    // Helper: Capitalize sentence
    function capitalizeSentence(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    // Live Stats Calculator
    function updateStats() {
        const text = transcriptTextarea.value.trim();
        const words = text ? text.split(/\s+/).length : 0;
        const chars = text.length;

        statWords.textContent = words.toLocaleString();
        statChars.textContent = chars.toLocaleString();

        const minutes = secondsElapsed / 60;
        const wpm = minutes > 0 ? Math.round(words / minutes) : 0;
        statWpm.innerHTML = `${wpm} <small>PPM</small>`;
    }

    // Render Timeline View
    function renderTimeline() {
        if (timelineEntries.length === 0) {
            timelineEmpty.style.display = 'flex';
            timelineList.innerHTML = '';
            return;
        }

        timelineEmpty.style.display = 'none';
        timelineList.innerHTML = timelineEntries.map((entry) => `
            <div class="timeline-item">
                <div class="timeline-time">${entry.timestamp}</div>
                <div class="timeline-text">${escapeHtml(entry.text)}</div>
            </div>
        `).join('');
    }

    function escapeHtml(str) {
        return str.replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;");
    }

    // Toggle Views (Text Editor vs Timeline)
    btnViewText.addEventListener('click', () => {
        btnViewText.classList.add('active');
        btnViewTimeline.classList.remove('active');
        textViewContainer.classList.remove('hidden');
        timelineViewContainer.classList.add('hidden');
    });

    btnViewTimeline.addEventListener('click', () => {
        btnViewTimeline.classList.add('active');
        btnViewText.classList.remove('active');
        timelineViewContainer.classList.remove('hidden');
        textViewContainer.classList.add('hidden');
        renderTimeline();
    });

    // Update Textarea Manual edits
    transcriptTextarea.addEventListener('input', () => {
        finalTranscript = transcriptTextarea.value;
        updateStats();
        updateDownloadState();
    });

    // Search in Text
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (!query) {
            renderTimeline();
            return;
        }
        
        // Highlight in timeline if open
        const items = timelineList.querySelectorAll('.timeline-item');
        items.forEach(item => {
            const content = item.querySelector('.timeline-text').textContent.toLowerCase();
            if (content.includes(query)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    });

    // Copy to Clipboard
    btnCopyText.addEventListener('click', () => {
        const textToCopy = transcriptTextarea.value;
        if (!textToCopy) {
            showToast('No hay texto para copiar.', 'warning');
            return;
        }
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('Transcripción copiada al portapapeles');
        }).catch(err => {
            showToast('Error al copiar el texto.', 'error');
        });
    });

    // Update Download Button State
    function updateDownloadState() {
        const hasText = transcriptTextarea.value.trim().length > 0;
        btnDownloadTxt.disabled = !hasText;
        btnDownloadMd.disabled = !hasText;
        btnDownloadJson.disabled = !hasText;
    }

    // Downloads Handlers
    function triggerDownload(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // Download Audio WebM
    btnDownloadAudioWebm.addEventListener('click', () => {
        if (!recordedAudioBlob) return;
        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `vocalscript-audio-${dateStr}.webm`;
        const url = URL.createObjectURL(recordedAudioBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Descargando archivo de audio WebM...');
    });

    // Download Audio WAV (Convert Blob to WAV)
    btnDownloadAudioWav.addEventListener('click', async () => {
        if (!recordedAudioBlob) return;
        try {
            showToast('Generando formato WAV...');
            const arrayBuffer = await recordedAudioBlob.arrayBuffer();
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            const wavBlob = audioBufferToWav(decodedBuffer);
            
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `vocalscript-audio-${dateStr}.wav`;
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Descargando archivo de audio WAV...');
        } catch (e) {
            console.error('Error generating WAV:', e);
            showToast('Descargando en formato WebM original...');
            btnDownloadAudioWebm.click();
        }
    });

    // Download Plain Text (.TXT)
    btnDownloadTxt.addEventListener('click', () => {
        const text = transcriptTextarea.value;
        const dateStr = new Date().toISOString().slice(0, 10);
        triggerDownload(text, `transcripcion-${dateStr}.txt`, 'text/plain;charset=utf-8');
        showToast('Descargado archivo .TXT');
    });

    // Download Markdown (.MD)
    btnDownloadMd.addEventListener('click', () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        const timeStr = timerDisplay.textContent;
        const lang = languageSelect.options[languageSelect.selectedIndex].text;

        let markdownContent = `# Transcripción VocalScript Studio\n\n`;
        markdownContent += `- **Fecha**: ${dateStr}\n`;
        markdownContent += `- **Duración Total**: ${timeStr}\n`;
        markdownContent += `- **Idioma**: ${lang}\n`;
        markdownContent += `- **Total Palabras**: ${statWords.textContent}\n\n`;
        markdownContent += `---\n\n## Texto Completo\n\n${transcriptTextarea.value}\n\n`;
        
        if (timelineEntries.length > 0) {
            markdownContent += `## Línea de Tiempo con Marcas de Tiempo\n\n`;
            timelineEntries.forEach(entry => {
                markdownContent += `- **\`[${entry.timestamp}]\`**: ${entry.text}\n`;
            });
        }

        triggerDownload(markdownContent, `transcripcion-${dateStr}.md`, 'text/markdown;charset=utf-8');
        showToast('Descargado archivo Markdown (.MD)');
    });

    // Download JSON (.JSON)
    btnDownloadJson.addEventListener('click', () => {
        const dateStr = new Date().toISOString().slice(0, 10);
        const jsonData = {
            metadata: {
                app: "VocalScript Studio",
                date: new Date().toISOString(),
                duration: timerDisplay.textContent,
                language: languageSelect.value,
                wordsCount: parseInt(statWords.textContent.replace(/,/g, '')),
                charsCount: parseInt(statChars.textContent.replace(/,/g, ''))
            },
            fullText: transcriptTextarea.value,
            timeline: timelineEntries
        };

        triggerDownload(JSON.stringify(jsonData, null, 2), `transcripcion-${dateStr}.json`, 'application/json');
        showToast('Descargado archivo JSON (.JSON)');
    });

    // Audio Buffer to WAV Converter Function
    function audioBufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        
        let result;
        if (numChannels === 2) {
            result = interleave(buffer.getChannelData(0), buffer.getChannelData(1));
        } else {
            result = buffer.getChannelData(0);
        }

        const dataLength = result.length * (bitDepth / 8);
        const headerLength = 44;
        const wavBuffer = new ArrayBuffer(headerLength + dataLength);
        const view = new DataView(wavBuffer);

        /* RIFF identifier */
        writeString(view, 0, 'RIFF');
        /* RIFF chunk length */
        view.setUint32(4, 36 + dataLength, true);
        /* RIFF type */
        writeString(view, 8, 'WAVE');
        /* format chunk identifier */
        writeString(view, 12, 'fmt ');
        /* format chunk length */
        view.setUint32(16, 16, true);
        /* sample format (raw) */
        view.setUint16(20, format, true);
        /* channel count */
        view.setUint16(22, numChannels, true);
        /* sample rate */
        view.setUint32(24, sampleRate, true);
        /* byte rate (sample rate * block align) */
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
        /* block align (channel count * bytes per sample) */
        view.setUint16(32, numChannels * (bitDepth / 8), true);
        /* bits per sample */
        view.setUint16(34, bitDepth, true);
        /* data chunk identifier */
        writeString(view, 36, 'data');
        /* data chunk length */
        view.setUint32(40, dataLength, true);

        // Write PCM samples
        let offset = 44;
        for (let i = 0; i < result.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, result[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }

        return new Blob([view], { type: 'audio/wav' });
    }

    function interleave(inputL, inputR) {
        const length = inputL.length + inputR.length;
        const result = new Float32Array(length);
        let index = 0;
        let inputIndex = 0;

        while (index < length) {
            result[index++] = inputL[inputIndex];
            result[index++] = inputR[inputIndex];
            inputIndex++;
        }
        return result;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Toast Notification System
    let toastTimeout;
    function showToast(msg, type = 'success') {
        toastMessage.textContent = msg;
        toastNotification.className = `toast ${type}`;
        
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toastNotification.classList.add('hidden');
        }, 3200);
    }

    // Attach Event Listeners
    btnRecord.addEventListener('click', startRecording);
    btnPause.addEventListener('click', pauseRecording);
    btnStop.addEventListener('click', stopRecording);
    btnClear.addEventListener('click', clearAll);

    // Keyboard Shortcuts (Space for pause/resume when recording, Esc to stop)
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (e.code === 'KeyR' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!isRecording) startRecording();
        } else if (e.code === 'Escape' && isRecording) {
            stopRecording();
        }
    });
});
