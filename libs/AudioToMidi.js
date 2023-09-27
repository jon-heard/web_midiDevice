
function absoluteNoteToNoteAndOctave(absoluteNote) {
	return [absoluteNote % 12, Math.trunc(absoluteNote / 12)];
}
function absoluteNoteToNoteName(absoluteNote, octaveAdjust = 0) {
	if (absoluteNote === 0) return '-';
	const [note, octave] = absoluteNoteToNoteAndOctave(absoluteNote);
	return `${NOTE_STRINGS[note]}${octave + octaveAdjust}`;
}

class AudioToMidi extends EventTarget {
	constructor() {
		super();
		this.#audioContext = new (window.AudioContext || window.webkitAudioContext)();
		navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
		navigator.getUserMedia({audio: true}, this.#onStream.bind(this), this.#onStreamError.bind(this));
	}

	setEnabled(value) {
		if (this.#enabled === value) return;
		this.#enabled = value;
		if (value) {
			requestAnimationFrame(this.#boundFnc_process);
		}
	}

	setNoteStartDelay(value) { this.#noteStartDelay = value; }

	setNotePitchedDelay(value) { this.#notePitchedDelay = value; }

	setOctaveAdjust(value) { this.#octaveAdjust = value; }

	setKey(value) { this.#key = value; }

	#OCTAVE_LIMIT = 9;

	#enabled = false;
	#noteStartDelay = 2;
	#notePitchedDelay = 12;
	#octaveAdjust = 0;
	#key = -1;
	#badDataAllowance = 3;
	#noteStabilityTimespan = 16;

	#audioContext = null;
	#analyser = null;
	#boundFnc_process = this.#process.bind(this);
	#dataCount = 0;
	#badDataCount = 0;
	#noteCounts = Array(12).fill(0);
	#octaveCounts = Array(12).fill(0);
	#currentAbsoluteNote = 0;
	#noteChangeValue = -1;
	#noteStabilityCount = 0;
	#audioDatas = [];
	
	#onStreamError(evt) {
		console.error('Failed to get microphone', evt);
	}

	#onStream(stream) {
		const input = this.#audioContext.createMediaStreamSource(stream);
		this.#analyser = this.#audioContext.createAnalyser();
		input.connect(this.#analyser);
		this.#analyser.minDecibels = -100;
		this.#analyser.maxDecibels = -10;
		this.#analyser.smoothingTimeConstant = 0.85;
		this.setEnabled(true);
	}

	#sendEvent_currentNoteChanged(isStable) {
		const evt = new Event('currentNoteChanged');
		evt.noteName = absoluteNoteToNoteName(this.#currentAbsoluteNote, this.#octaveAdjust);
		evt.isStable = isStable;
		this.dispatchEvent(evt);
	}

	#process() {
		// Repeat processing, but only if enabled
		if (this.#enabled) {
			requestAnimationFrame(this.#boundFnc_process);
		} else {
			return;
		}

		// Get new pitch data
		const audioData = new Float32Array(this.#analyser.frequencyBinCount);
		this.#analyser.getFloatTimeDomainData(audioData);
		let pitchDatum = this.#autoCorrelate(audioData, this.#audioContext.sampleRate);

		// Process pitch data
		let noteChanged = false;
		if (pitchDatum !== -1) {
			// Note continues
			this.#dataCount++;
			this.#badDataCount = 0;
			if (this.#dataCount <= this.#notePitchedDelay) {
				this.#audioDatas.push(audioData);
			} else {
				const absoluteNote = this.#noteFromPitch(pitchDatum);
				const [newNoteValue, newNoteOctave] = absoluteNoteToNoteAndOctave(absoluteNote);
				if ((newNoteOctave + this.#octaveAdjust) < this.#OCTAVE_LIMIT) {
					this.#noteCounts[newNoteValue]++;
					this.#octaveCounts[newNoteOctave]++;
					if (absoluteNote === this.#currentAbsoluteNote) {
						this.#noteStabilityCount++;
						if (this.#noteStabilityCount === this.#noteStabilityTimespan) {
							this.#sendEvent_currentNoteChanged(true);
						}
					} else {
						const [currentNoteValue, currentNoteOctave] = absoluteNoteToNoteAndOctave(this.#currentAbsoluteNote);
						if (this.#noteCounts[newNoteValue] > this.#noteCounts[currentNoteValue] || this.#octaveCounts[newNoteOctave] > this.#octaveCounts[currentNoteOctave]) {
							this.#currentAbsoluteNote = absoluteNote;
							this.#sendEvent_currentNoteChanged();
						} else if (this.#noteStabilityCount > this.#noteStabilityTimespan || this.#noteChangeValue !== 0) {
							if (this.#noteChangeValue !== absoluteNote) {
								this.#noteStabilityCount = 0;
								this.#noteChangeValue = absoluteNote
							} else {
								this.#noteStabilityCount++;
								if (this.#noteStabilityCount > this.#noteStabilityTimespan) {
									noteChanged = true;
								}
							}
						}
					}
				}
			}
		}
		// Not else'd from prior if block because pitchDatum can be set to -1 within prior if block.
		if (pitchDatum === -1 || noteChanged) {
			// Allow for some bad pitch data
			if (!noteChanged) {
				this.#badDataCount++;
				if (this.#badDataCount < this.#badDataAllowance) return;
			}

			// End note on sufficient bad pitch data count
			if (this.#dataCount > this.#noteStartDelay) {
				if (this.#dataCount <= this.#notePitchedDelay) {
					const evt = new Event('midiSignal');
					evt.noteName = this.#audioDataHasRapidDropoff(this.#audioDatas) ? '=' : '-';
					this.dispatchEvent(evt);
				} else {
					// Send note
					const evt = new Event('midiSignal');
					evt.noteName = absoluteNoteToNoteName(this.#currentAbsoluteNote, this.#octaveAdjust);
					this.dispatchEvent(evt);
				}
				// Reset processing for next note
				this.#dataCount = this.#badDataCount = this.#noteStabilityCount = 0;
				this.#currentAbsoluteNote = this.#noteChangeValue = 0;
				this.#audioDatas = [];
				for (let i = 0; i < 12; i++) {
					this.#noteCounts[i] = this.#octaveCounts[i] = 0;
				}
				// If note was changed without pause, skip the delay
				if (noteChanged) {
					this.#dataCount = this.#notePitchedDelay;
				} else {
					// Notify of current note cleared
					this.#sendEvent_currentNoteChanged();
				}
			}
		}
	}

	#KEY_WEIGHTS = [/*1*/5.0, /*1#*/0.5, /*2*/1.0, /*2#*/0.8, /*3*/3.0, /*4*/2.0, /*4#*/.9, /*5*/4.0, /*5#*/0.9, /*6*/1.0, /*6#*/0.8, /*7*/2.0];
	#noteFromPitch(frequency) {
		const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2)) + 69;
		if (this.#key === -1) return Math.round(noteNum);
		const noteBelow = (Math.floor(noteNum) - this.#key) % 12;
		const noteAbove = (noteBelow + 1) % 12;
		if ((noteNum % 1) > this.#KEY_WEIGHTS[noteBelow] / (this.#KEY_WEIGHTS[noteBelow] + this.#KEY_WEIGHTS[noteAbove])) {
			return Math.ceil(noteNum);
		} else {
			return Math.floor(noteNum);
		}
	}
	// Must be called on analyser.getFloatTimeDomainData and audioContext.sampleRate
	// From https://github.com/cwilso/PitchDetect/pull/23
	#autoCorrelate(buffer, sampleRate) {
		// Perform a quick root-mean-square to see if we have enough signal
		var SIZE = buffer.length;
		var sumOfSquares = 0;
		for (var i = 0; i < SIZE; i++) {
			var val = buffer[i];
			sumOfSquares += val * val;
		}
		var rootMeanSquare = Math.sqrt(sumOfSquares / SIZE)
		if (rootMeanSquare < 0.01) {
			return -1;
		}

		// Find a range in the buffer where the values are below a given threshold.
		var r1 = 0;
		var r2 = SIZE - 1;
		var threshold = 0.2;

		// Walk up for r1
		for (var i = 0; i < SIZE / 2; i++) {
			if (Math.abs(buffer[i]) < threshold) {
				r1 = i;
				break;
			}
		}

		// Walk down for r2
		for (var i = 1; i < SIZE / 2; i++) {
			if (Math.abs(buffer[SIZE - i]) < threshold) {
				r2 = SIZE - i;
				break;
			}
		}

		// Trim the buffer to these ranges and update SIZE.
		buffer = buffer.slice(r1, r2);
		SIZE = buffer.length;

		// Create a new array of the sums of offsets to do the autocorrelation
		var c = new Array(SIZE).fill(0);
		// For each potential offset, calculate the sum of each buffer value times its offset value
		for (let i = 0; i < SIZE; i++) {
			for (let j = 0; j < SIZE - i; j++) {
				c[i] = c[i] + buffer[j] * buffer[j+i];
			}
		}

		// Find the last index where that value is greater than the next one (the dip)
		var d = 0;
		while (c[d] > c[d+1]) {
			d++;
		}

		// Iterate from that index through the end and find the maximum sum
		var maxValue = -1;
		var maxIndex = -1;
		for (var i = d; i < SIZE; i++) {
			if (c[i] > maxValue) {
				maxValue = c[i];
				maxIndex = i;
			}
		}

		var T0 = maxIndex;

		// Not as sure about this part, don't @ me
		// From the original author:
		// interpolation is parabolic interpolation. It helps with precision. We suppose that a parabola pass through the
		// three points that comprise the peak. 'a' and 'b' are the unknowns from the linear equation system and b/(2a) is
		// the "error" in the abscissa. Well x1,x2,x3 should be y1,y2,y3 because they are the ordinates.
		var x1 = c[T0 - 1];
		var x2 = c[T0];
		var x3 = c[T0 + 1]

		var a = (x1 + x3 - 2 * x2) / 2;
		var b = (x3 - x1) / 2
		if (a) {
			T0 = T0 - b / (2 * a);
		}

		return sampleRate/T0;
	}

	#audioDataHasRapidDropoff(datas) {
		const data = datas.map(data => Array.from(data)).flat(1);
		const reducedData = [];
		for (let i = 512; i < data.length; i += 512) {
			let reducedDatum = 0;
			for (let k = 0; k < 512; k++) {
				reducedDatum += Math.abs(data[i - k]);
			}
			reducedDatum /= 512;
			reducedData.push(reducedDatum);
		}
		let silenceLimit = reducedData[0];
		let isInSoundData = false;
		let indexOfMaxData = 0;
		let countFromLargestData = 0;
		for (let dataIndex = 1; dataIndex < reducedData.length; dataIndex++) {
			// Skip until we're beyond the initial silence
			if (!isInSoundData && reducedData[dataIndex] < silenceLimit) continue;
			if (reducedData[dataIndex] > reducedData[indexOfMaxData]) {
				indexOfMaxData = dataIndex;
				countFromLargestData = 0;
			} else {
				countFromLargestData++;
				if (reducedData[dataIndex] < silenceLimit) {
					break;
				}
			}
		}
console.log(countFromLargestData);
		return countFromLargestData < 8;
	}
}
