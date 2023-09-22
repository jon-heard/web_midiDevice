
class VibratoMaker {
	constructor(midiChannels) {
		this.#midiChannels = midiChannels;
		this.#boundFnc_frame = this.#frame.bind(this);
		requestAnimationFrame(this.#boundFnc_frame);
	}

	setEnabled(value) {
		if (this.#enabled === value) return;
		this.#enabled = value;
		if (value) {
			requestAnimationFrame(this.#boundFnc_frame);
		} else {
			for (let channelId = 0; channelId < this.#midiChannels.length; channelId++) {
				this.#midiChannels[channelId].sendPitchBend(this.#basePitch * 2 - 1);
			}
		}
	}

	setPitchRange(value) { this.#pitchRange = value; }

	setBasePitch(value) {
		this.#basePitch = value;
		if (!this.#enabled) {
			for (let channelId = 0; channelId < this.#midiChannels.length; channelId++) {
				this.#midiChannels[channelId].sendPitchBend(this.#basePitch * 2 - 1);
			}
		}
	}

	setSpeed(value) { this.#speed = value; }

	setDepth(value) { this.#depth = value; }

	#SPEED_ADJUST = .01;
	#DEPTH_ADJUST = .15;

	#enabled = true;
	#pitchRange = 1;
	#basePitch = 0.5;
	#speed = .5;
	#depth = .5;
	#priorTime = 0;
	#timing = 0;

	#midiChannels = null;
	#boundFnc_frame = null;

	#frame(time) {
		if (!this.#enabled) return;
		let finalPitch = this.#basePitch;
		if (this.#speed) {
			this.#timing += (time - this.#priorTime) / this.#speed * this.#SPEED_ADJUST;
			this.#priorTime = time;
			const vibratoAdjust = Math.sin(this.#timing) * this.#depth * this.#DEPTH_ADJUST;
			finalPitch = this.#basePitch + vibratoAdjust / this.#pitchRange;
		}
		finalPitch = Math.min(Math.max(finalPitch, 0), 1);
		finalPitch = finalPitch * 2 - 1;
		for (let channelId = 0; channelId < this.#midiChannels.length; channelId++) {
			this.#midiChannels[channelId].sendPitchBend(finalPitch);
		}
		requestAnimationFrame(this.#boundFnc_frame);
	}
}
