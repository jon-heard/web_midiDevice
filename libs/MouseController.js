
const PI2 = Math.PI * 2;
function echo(v) { return v; }
function makeModFunction(modText) {
	if (!modText) return echo;
	try {
		return new Function('value', `${modText};return value;`);
	} catch(e) {
		console.warn('Invalid mod-text:\n', modText);
		return echo;
	}
}
const MIDI_CONTROL_NAMES = {
	0:'BANK SELECT', 1:'MODULATION', 2:'BREATH', 4:'FOOT PEDAL', 5:'PORTAMENTO TIME', 6:'DATA ENTRY', 7:'VOLUME', 8:'BALANCE', 10:'PAN', 11:'EXPRESSION', 12:'EFFECT 1', 13:'EFFECT 2',
	16:'GENERAL 1', 17:'GENERAL 2', 18:'GENERAL 3', 19:'GENERAL 4', 64:'DAMPER PEDAL', 65:'PORTAMENTO TOGGLE', 66:'SOSTENUTO PEDAL', 67:'SOFT PEDAL', 68:'LEGATO PEDAL', 69:'HOLD 2',
	70:'SOUND CONTROL 1', 71:'SOUND CONTROL 2', 72:'SOUND CONTROL 3', 73:'SOUND CONTROL 4', 74:'SOUND CONTROL 5', 75:'SOUND CONTROL 6', 76:'SOUND CONTROL 7', 77:'SOUND CONTROL 8',
	78:'SOUND CONTROL 9', 79:'SOUND CONTROL 10', 80:'GENERAL 5', 81:'GENERAL 6', 82:'GENERAL 7', 83:'GENERAL 8', 84:'PORTAMENTO AMOUNT', 88:'VELOCITY HIRES', 91:'EFFECT 1 DEPTH',
	92:'EFFECT 2 DEPTH', 93:'EFFECT 3 DEPTH', 94:'EFFECT 4 DEPTH', 95:'EFFECT 5 DEPTH', 96:'DATA+1', 97:'DATA-1', 120:'ALL SOUNDS OFF', 121:'RESET ALL CONTROLS', 122:'LOCAL ON/OFF',
	123:'ALL NOTES OFF', 124:'OMNI MODE OFF', 125:'OMNI MODE ON', 126:'MONO MODE', 127:'POLY MODE', 128:'PITCH', 129:'VIBRATO SPEED', 130:'VIBRATO DEPTH'
};

class MouseController extends EventTarget {
	constructor(canvas, uiSize, axisPairCount) {
		super();
		this.#canvas = canvas;
		this.#uiSize = uiSize;
		this.#axisPairCount = axisPairCount;
		this.#context = this.#canvas.getContext('2d');
		this.#canvas.width = this.#uiSize;
		this.#canvas.height = this.#uiSize;
		this.#axisControlIds = Array(this.#axisPairCount * 2).fill(0);
		this.#canvas.addEventListener('mousedown', evt => this.#onPointerDown(evt));
		this.#canvas.addEventListener('mouseup', evt => this.#onPointerUp(evt));
		this.#canvas.addEventListener('mousemove', evt => this.#onPointerMove(evt));
		this.#canvas.addEventListener('wheel', evt => this.#onWheel(evt));
		this.#canvas.addEventListener('contextmenu', evt => { evt.preventDefault(); return false; });
		for (let controlId = 0; controlId < this.#controlProperties.length; controlId++) {
			this.#controlProperties[controlId].snap = parseFloat(localStorage[`${this.#STORAGE_PREFIX}_${controlId}_snap`] ?? -0.5);
			const modText = localStorage[`${this.#STORAGE_PREFIX}_${controlId}_mod`] || '';
			this.#controlProperties[controlId].modText = modText;
			this.#controlProperties[controlId].modFunction = makeModFunction(modText);
		}
		for (let axisId = 0; axisId < this.#axisControlIds.length; axisId++) {
			this.#axisControlIds[axisId] = parseInt(localStorage[`${this.#STORAGE_PREFIX}_axisId_${axisId}`] ?? this.#DEFAULT_AXIS_CONTROLS[axisId] ?? 0, 10);
		}
		this.#renderMouseUp();
	}

	setAxisPair(pairId) {
		this.#pairId = pairId;
		this.#renderMouseUp();
	}

	setAxisControl(axisId, controlId) {
		this.#axisControlIds[axisId] = controlId;
		localStorage[`${this.#STORAGE_PREFIX}_axisId_${axisId}`] = controlId;
	}

	setAxisSnap(axisId, snapValue) {
		const controlProperties = this.getAxisControlProperties(axisId);
		controlProperties.snap = snapValue;
		if (snapValue === -0.5) {
			delete localStorage[`${this.#STORAGE_PREFIX}_${controlProperties.id}_snap`];
		} else {
			localStorage[`${this.#STORAGE_PREFIX}_${controlProperties.id}_snap`] = snapValue;
		}
	}

	setAxisMod(axisId, modText) {
		const controlProperties = this.getAxisControlProperties(axisId);
		const modFunction = makeModFunction(modText);
		controlProperties.modFunction = modFunction;
		if (modFunction === echo) {
			controlProperties.modText = '';
			delete localStorage[`${this.#STORAGE_PREFIX}_${controlProperties.id}_mod`];
		} else {
			controlProperties.modText = modText;
			localStorage[`${this.#STORAGE_PREFIX}_${controlProperties.id}_mod`] = modText;
		}
	}

	getControlProperties(controlId) {
		return this.#controlProperties[controlId];
	}

	getAxisControlProperties(axisId) {
		return this.#controlProperties[this.#axisControlIds[axisId] + this.#pairId * 2];
	}

	getAxisControlId(axisId) {
		return this.#axisControlIds[axisId];
	}

	#TARGET_SIZE = 4;
	#HALF_TARGET_SIZE = this.#TARGET_SIZE / 2;
	#POS_CIRCLE_SIZE = 10;
	#ZOOM_RATE = 0.5;
	#AXIS_LABEL_POS_X = 10;
	#AXIS_LABEL_POS_Y = [30, 60];
	#DEFAULT_AXIS_CONTROLS = [11, 128, 129, 130];
	#STORAGE_PREFIX = 'midi_controller';

	#uiSize = 0;
	#canvas = null;
	#context = null;
	#boundFnc_renderMouseDown = this.#renderMouseDown.bind(this);

	#isDragging = false;
	#axisDraggedStates = [false, false];
	#pointerDragPositionStart = [0, 0];
	#pointerDragPosition = [0, 0];
	#pointerDragAxisValueStart = [0, 0];
	#zoomBoxCenter = [0, 0];

	#pairId = 0;
	#axisPairCount = 0;
	#axisControlIds = null;
	#axisScale = .005;
	#zoomSize = 1 / this.#axisScale;
	#controlProperties = Array(131).fill(null).map((x, index) => { return { id: index, value: 0.5, snap: -0.5, modText: '', modFunction: echo }; });

	#setAxisValue(axisId, value) {
		this.getAxisControlProperties(axisId).value = value;
		const evt = new Event('axisValueChange');
		evt.axis = axisId + this.#pairId * 2;
		evt.value = this.#getAxisValue(axisId);
		this.dispatchEvent(evt);
	}

	#getAxisValue(axisId, unmodded) {
		if (unmodded) {
			return this.getAxisControlProperties(axisId).value;
		} else {
			const controlProperties = this.getAxisControlProperties(axisId);
			try {
				return controlProperties.modFunction(controlProperties.value);
			} catch (e) {
				console.warn('Failed to run control mod:', controlProperties.modText);
				return controlProperties.value;
			}
		}
	}

	#setVec(dst, v1, v2) {
		dst[0] = v1;
		dst[1] = v2;
	}

	#setVecUniform(dst, v) {
		dst[0] = v;
		dst[1] = v;
	}

	#cpyVec(dst, src) {
		dst[0] = src[0];
		dst[1] = src[1];
	}

	#onPointerDown(evt) {
		if (evt.button == 0)
		{
			this.#axisDraggedStates[0] = true;
		} else if (evt.button == 2) {
			this.#axisDraggedStates[1] = true;
		} else {
			return;
		}
		const canvasRect = this.#canvas.getBoundingClientRect();
		this.#setVec(this.#pointerDragPosition, evt.clientX - canvasRect.left, evt.clientY - canvasRect.top);
		this.#cpyVec(this.#pointerDragPositionStart, this.#pointerDragPosition);
		this.#setVec(this.#pointerDragAxisValueStart, this.#getAxisValue(0, true), this.#getAxisValue(1, true));
		this.#setVec(this.#zoomBoxCenter,
			this.#pointerDragPositionStart[0] + (0.5 - this.#pointerDragAxisValueStart[0]) * this.#zoomSize,
			this.#pointerDragPositionStart[1] + (0.5 - this.#pointerDragAxisValueStart[1]) * this.#zoomSize);
		this.#isDragging = true;
		requestAnimationFrame(this.#boundFnc_renderMouseDown);
	}

	#onPointerMove(evt) {
		if (!this.#isDragging) return;
		const canvasRect = this.#canvas.getBoundingClientRect();
		this.#setVec(this.#pointerDragPosition, evt.clientX - canvasRect.left, evt.clientY - canvasRect.top);
		for (let axisId = 0; axisId < 2; axisId++) {
			if (!this.#axisDraggedStates[axisId]) continue;
			let value = this.#pointerDragAxisValueStart[axisId] + (this.#pointerDragPosition[axisId] - this.#pointerDragPositionStart[axisId]) * this.#axisScale;
			value = Math.min(Math.max(value, 0.0), 1.0);
			this.#setAxisValue(axisId, value);
		}
	}

	#onPointerUp(evt) {
		for (let axisId = 0; axisId < 2; axisId++) {
			if (evt.button !== axisId * 2) continue;
			this.#axisDraggedStates[axisId] = false;
			let value = this.getAxisControlProperties(axisId).snap;
			if (value < 0)
			{
				value = this.#pointerDragAxisValueStart[axisId] + (this.#pointerDragPosition[axisId] - this.#pointerDragPositionStart[axisId]) * this.#axisScale;
				value = Math.max(Math.min(value, 1.0), 0.0);
			}
			this.#setAxisValue(axisId, value);
		}
		if (!this.#axisDraggedStates[0] && !this.#axisDraggedStates[1]) {
			this.#isDragging = false;
			this.#renderMouseUp();
		}
	}

	#onWheel(evt) {
		if (evt.deltaY < 0) {
			this.#axisScale *= this.#ZOOM_RATE;
		} else {
			this.#axisScale /= this.#ZOOM_RATE;
		}
		this.#zoomSize = 1 / this.#axisScale;
		this.#renderMouseUp();
	}

	#renderMouseDown() {
		if (!this.#isDragging) return;
		this.#clearToColor('grey');
		this.#renderZoomBox();
		this.#renderStartTarget();
		this.#renderValuePosition();
		this.#renderValueLabels();
		requestAnimationFrame(this.#boundFnc_renderMouseDown);
	}

	#renderMouseUp() {
		this.#clearToColor('grey');
		this.#setVecUniform(this.#zoomBoxCenter, this.#uiSize / 2);
		this.#renderZoomBox();
		this.#renderValuePosition();
		this.#renderValueLabels();
	}

	#clearToColor(color) {
		this.#context.fillStyle = color;
		this.#context.fillRect(0, 0, this.#uiSize, this.#uiSize);
	}

	#renderZoomBox() {
		this.#context.strokeStyle = "white";
		this.#context.lineWidth = this.#TARGET_SIZE;
		const halfZoomSize = this.#zoomSize / 2;
		this.#context.strokeRect(this.#zoomBoxCenter[0] - halfZoomSize, this.#zoomBoxCenter[1] - halfZoomSize, this.#zoomSize, this.#zoomSize);
	}

	#renderStartTarget() {
		this.#context.fillStyle = 'white';
		this.#context.fillRect(this.#pointerDragPositionStart[0] - this.#HALF_TARGET_SIZE, 0, this.#TARGET_SIZE, this.#uiSize);
		this.#context.fillRect(0, this.#pointerDragPositionStart[1] - this.#HALF_TARGET_SIZE, this.#uiSize, this.#TARGET_SIZE);
	}

	#renderValuePosition() {
		this.#context.fillStyle = 'blue';
		this.#context.beginPath();
		const values = [ this.#getAxisValue(0, true), this.#getAxisValue(1, true) ];
		this.#context.arc(this.#zoomBoxCenter[0] + (values[0] - 0.5) * this.#zoomSize, this.#zoomBoxCenter[1] + (values[1] - 0.5) * this.#zoomSize, this.#POS_CIRCLE_SIZE, 0, PI2);
		this.#context.fill();
	}

	#renderValueLabels() {
		this.#context.font = "30px serif";
		this.#context.fillStyle = 'black';
		for (let axisId = 0; axisId < 2; axisId++) {
			const axisName = MIDI_CONTROL_NAMES[this.#axisControlIds[axisId + this.#pairId * 2]] || axisId;
			const axisValue = Math.trunc(this.#getAxisValue(axisId) * 100);
			this.#context.fillText(`${axisName}: ${axisValue}`, this.#AXIS_LABEL_POS_X, this.#AXIS_LABEL_POS_Y[axisId]);
		}
	}
}