IfWinNotExist, OpenMPT
{
	MsgBox OpenMPT window not found.\nQuitting AHK script.
	ExitApp
}

#include Midi.ahk
midi := new Midi()
midi.OpenMidiIn(0)
Return

MidiControlChange119:
	value := midi.MidiIn().value
	Switch midi.MidiIn().value
	{
		case 0:
			ControlSend, AfxFrameOrView140su2, {Up down}, OpenMPT
			return
		case 1:
			ControlSend, AfxFrameOrView140su2, {Up up}, OpenMPT
			return
		case 2:
			ControlSend, AfxFrameOrView140su2, {Down down}, OpenMPT
			return
		case 3:
			ControlSend, AfxFrameOrView140su2, {Down up}, OpenMPT
			return
		case 4:
			ControlSend, AfxFrameOrView140su2, {Left down}, OpenMPT
			return
		case 5:
			ControlSend, AfxFrameOrView140su2, {Left up}, OpenMPT
			return
		case 6:
			ControlSend, AfxFrameOrView140su2, {Right down}, OpenMPT
			return
		case 7:
			ControlSend, AfxFrameOrView140su2, {Right up}, OpenMPT
			return
		case 8:
			ControlSend, AfxFrameOrView140su2, {= down}, OpenMPT
			return
		case 9:
			ControlSend, AfxFrameOrView140su2, {= up}, OpenMPT
			return
/*
// Unused ATM
		case 10:
			ControlSend, AfxFrameOrView140su2, {Shift down}, OpenMPT
			return
		case 11:
			ControlSend, AfxFrameOrView140su2, {Shift up}, OpenMPT
			return
*/
		case 12:
			ControlSend, AfxFrameOrView140su2, {F12}{Del}, OpenMPT
			return
		case 13:
			return
		case 14:
			ControlSend, AfxFrameOrView140su2, {space down}, OpenMPT
			return
		case 15:
			ControlSend, AfxFrameOrView140su2, {space up}, OpenMPT
			return
		case 16:
			ControlSend, AfxFrameOrView140su2, ^{Home}, OpenMPT
			return
		case 17:
			return
	}
	return
