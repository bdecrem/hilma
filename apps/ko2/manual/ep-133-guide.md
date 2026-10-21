# EP–133 K.O. II guide (teenage engineering)

Converted from https://teenage.engineering/guides/ep-133 by apps/ko2/manual/fetch-guide.py. Section numbers are the guide's own.

# whats new

what's new

os 2.5

no headphone jack? no problem! now you can use USB audio with any class compliant USB audio host to connect your KO2 straight in and send audio in and out of your phone or computer.

ko2 supports stereo audio in, as both a sample source and an audio source. as well as usb audio out, to record sound directly into your DAW, or any other class compliant device. 

just plug KO2 into your phone or computer and select it as an input or output, or both!

selpmas esrever nac uoy won! 

reversing samples is a great way to bring life back to your existing sample library and discover new textures.

to reverse a sample, add it to a pad then press (shift) + (sound) to open (sound)(edit), press (plus) until you reach “tim”. rotate the (knobx) knob until “rev” shows on the display. play the sample again and it will be reversed. now you can go back to (main) and make a beat with it.

add character and use less storage by lowering the recording sample rate.

you can change the sample rate in system settings. press (shift) and (erase) to open (system) settings. press (plus) until you reach “smp” press (enter) and then “rec” will show on the screen. press (enter) again, then use (minus) and (plus) to select between lo, mid and hi sample rates.

lo is 26,250khz - which is very lo-fi.
mid is 32,000khz - which adds some charater.
hi is the standard 46,875khz - which is the standard quality on ko2.

if you want any other sample rates you can import samples at any sample rate directly onto ko2 using the ep-sample-tool.

20 seconds not enough? now you can record mono samples up to 40 seconds long.

just switch the sample type to mono and the sample time will adjust up to 40 seconds, perfect for extra long samples.

to record a mono sample: press (sample), then press choose a mono source with (minus) and (plus) and hold a pad to record the sample to that pad.

precisely slice your samples with equal length auto chop. now all your samples will slice exactly into even divisions, ideal for chopping a vocal or break beat.

select a sample on the (pads). press (shift) and (sample) to (chop). hold a group pad to select the auto chop mode and press (minus) and (plus) to select “EQU”. now you can let go of the group pad and select how many slices you want with (minus) and (plus). go back to (main) and your sample has been chopped.

after many, many requests an arpeggio finally makes it’s way onto KO2!

to activate it, just enter (keys) mode, hold (timing) and press multiple (pads). as long as the sound mode of the sample is either a oneshot or legato type sound it will be arpeggiated.

you can change the sound mode of any sample by pressing the pad it’s on and entering sound edit mode with (shift) and (sound).

audio and sampling

added: Improved timestretching: Heavily stretched samples sound cleaner, preventing beats from doubling or skipping. Ported from EP-1320.

added: Crop sample to trim points: Hold SHIFT+SOUND in the Trim page to permanently trim the file on disk.

added: Playback position display: SOUND EDIT TRI shows position in seconds while a pad is held.

fix: Improved handling of disk full when saving samples.

fix: SHIFT+CHOP chopped the wrong pad after switching groups.

fix: pad LEDs could get stuck after returning to main view from chop.

fix: Uploading samples while in SAMPLE could corrupt samples.

fix: Pressing FADER unexpectedly exited FX send mode.

fix: Crash when transferring samples via EP Sample Tool with unstable USB connections.

fix: Resampling a pattern could stop at wrong time when beat repeat was active.

fix: Sample trim points preserved when exporting/re-importing via EP Sample Tool.

fix: Long sample names scroll in a continuous loop when holding pad in SOUND.

Sequencer and Performance

added: Per-pad pattern copy/paste. Hold a pad + SHIFT+C to copy that pad's notes. SHIFT+D to paste.

added: erase fader automation per-function. erase+fader+pad erases automation for that pad's fader function (level, pitch, pan, etc.).

added: Timing correct, per-pad time shift: Hold a pad and press +/- to shift all notes in that track by one tick.

added: Hold FX during latched resampling (SHIFT+pad) to tweak FX X/Y live.

fix: PO sync (SYNC 8) auto-start fixed after stopping sequencer on internal clock.

fix: FX+GROUP solo now also selects that group as the active edit group.

fix: SHIFT+FADER (fader reset/recall) disabled during playback to avoid conflicting with fader automation.

fix: Legato mode, notes no longer stick when playing keys over a running pattern.

fix: Beat repeat (FX+1) could silence a note still playing when engaged from bar 2 onward.

fix: Beat repeat could cut off the wrong note when used with mute groups.

fix: PO sync auto-start now restarts from the beginning.

fix: Rare crash while switching patterns.

fix: Undo icon now lights up when erasing notes with ERASE+GROUP while playing.

fix: Pasting a single track (TRK) no longer shortens the destination pattern.

fix: Note repeat with swing. notes could be cut short or skipped in LEG and KEY play modes.

fix: Audio glitch when switching scenes while sequencer is playing.

fix: Crash when switching projects ("ERR SCENE 109").

fix: Sequencer "reset all controllers" now also resets local pitch bend and mod wheel state.

fix: Sounds no longer cut off instantly when song reaches the end.

keys mode

changed: New scale/key selection. Hold KEYS + turn X knob for key, Y knob for scale.

added: Three new scales: Blues (BLU), Harmonic Minor (H.MI), Melodic Minor (M.MI).

changed: Scale and key are now saved per project.

MIDI and sync

added: CC 64 sustain pedal support for Key and Legato voices.

added: CC 12/13 control for FX X/Y parameters

added: MIDI identity request/reply now works over TRS MIDI.

fix: Improved SYNC 16/24 IN handling of noisy start/stop signals.

fix: Avoided stuck notes when changing MIDI channel in SOUND EDIT.

improvements

FX dry/wet balance: Reverb, delay and chorus now preserve more dry signal as wet is turned up (ported from EP-40).

Mono panning: Constant power panning — mono sounds no longer get quieter when panned.

BLE MIDI clock: Reduced jitter by measuring BPM per beat rather than per tick. Improves timestretch and sidechain sync over BLE.

BAR time stretch now syncs correctly in non-4/4 time signatures.

fix: Song mode SPP. MIDI Song Position Pointer is now relative to song start, not scene start. DAW playhead navigation works correctly.

fix: improved file transfer reliability and reduced audio pops during transfer.

fix: Improved SHIFT+X/Y finetune of trim points: Holding shift zooms to a 1 second window.

fix: Firmware update rewritten for improved robustness against transfer errors.

fix: Battery power dips now cause a clean reboot with BAT message instead of audio glitches.

update your device here

os 2.0.5

release notes

improved audio stability to reduce glitches.

restored SYNC OUT continuous clock output.

fixed: bug fixes and performance improvements for EP SAMPLE TOOL.

fixed: various UI quirks related to faders, sampling, and chopping

fixed: turned-off LEDs could sometimes glow dimly.

fixed: various MIDI bugs.

os 2.0.2

new features!

added: Show "disk low" warning message when pressing SAMPLE and there is not enough disk space to record 20 seconds.

added: midi reset all controllers on sequencer stop. this is now system setting 140 (on) and 141 (off).

project management

fix: project erase did not reset scenes

fix: Project erase did not reset some pad settings (e.g. MIDI channel).

fix: Swing was not updated when loading a new project.

fix: After loading a project, erasing notes would not enable the undo umbrella.

sound editing

fix: With a perfectly timed stop, the sequencer could stop past pattern end. (E.g. 5.1.1 for a 4-bar pattern.)

fix: Only record note repeats for the currently selected group.

fix: For some notes, LEDs were not lit for the full duration. This caused misleading blinks at note-off.

fix: Stuck notes when using punch in fx pad 0.

sampling

added: Show "disk low" warning message when pressing SAMPLE and there is not enough disk space to record 20 seconds.

fix: When hands-free sampling 20 seconds of stereo, the device would incorrectly display "FUL" and discard the recording.

fix: Newly recorded samples would inherit settings (like pan or pitch) from the pad's previous state.

fix: faster storage cleanup after deleting samples.

fix: When fixed-length resampling a pattern, start recording instantly, also  capturing any initial silence. This preserves the timing relative to pattern start.

sound editing

fix: Trim in would not always move to sample start.

fix: Small trims would not enable the scissors icon.

fix: The UI did not refresh after pasting a pad.

fix: Keep pad settings when browsing sounds with +/- and returning to original sound. Numpad selection acts as a fresh load.

fix: Pads would leave mute groups when changing sound.

fix: Improved initial BPM and bar length detection for samples imported via EP SAMPLE TOOL, especially those with custom sample rates.

midi and sync

removed: midi program change support. program change can still be recorded and relayed but is no longer mapped on the device.

added: midi reset all controllers on sequencer stop. this is now system setting 140 (on) and 141 (off).

fix: Recording fast external MIDI aftertouch/pitch bend messages no longer causes audio stutter on playback.

fix: Stuck notes when changing pads while playing on MIDI controller.

fix: Sync icon blinked with wrong rate.

fix: Do not record MIDI Channel Mode messages

fix: TRS midi out could sometimes fail. (running status wasn't reset)

misc

fix: System settings did not show navigation after punching in a number.

fix: A rare issue where some machines would display a garbled error message on startup.

fix: Allow switching scenes by MAIN+single digit.

os 2.0.1

scenes
Erase Scene ((ERASE)+(mAIN)) Update:

Hold for 2s:

If the current scene is empty and not part of the song, it is deleted (displays “DEL”). 

Otherwise, its contents are cleared (displays “CLR”).

SONG MODE

changed: stop the song when it reaches end.

changed: when stopping a song, go back to the position where the song was started.
 fix: undo while recording could restore the wrong pattern.

fix: pause song progression when LOOP mode is active.

fix: when recording, notes sometimes got quantised to the wrong pattern.

fix: stay in active scene when leaving song mode.
 fix: Improved song mode cut/paste visual feedback.

sampling

new: allow chopping a sample from one group to another.

(Example: Press (groupa), select a sound by pressing pad, press (groupB), CHOP!)

fix: hands-free sampling was allowed on already recorded pads, causing a weird state

fix: hands-free sampling did not stop automatically after 20 seconds.

fix: lag when retaking a sample.
 fix: the sequencer sometimes did not stop after fixed-length pattern recording.

fix: in hands-free sampling, prevent changing the fixed recording length using (plus) / (minus) after recording has started.

connectivity

new: added system setting MID -> CHN -> OFF (127). When selected, pads only send and receive MIDI voice messages if a MIDI channel is assigned in SOUND EDIT.

new: reduced latency by enabling running status on TRS MIDI OUT.

fix: weird behaviours when recording with external clock.

sync in start did not exit record arm mode.

in some cases, stop did not stop recording and metronome.

fix: Program Change and Channel Pressure messages on TRS MIDI OUT.

fix: OMNI/basic channel MIDI notes were forwarded even if MIDI THRU was OFF.

fix: SYNC24 OUT did not work well with some devices (e.g. MC-202).

fix: Improved USB reliability when connecting to Windows PCs.

fix: handle unsupported characters when uploading sounds with EP SAMPLE TOOL.

sound edit

fix: SOUND EDIT trim out audition was broken if trim in was greater than 0.

fix: sound pitch could get stuck at 0.00 when finetuning.

fix: AMP could be displayed instead of PTC when changing sound pitch with Y knob.

fix: timestretch did not work with external clock.

fix: Sound timestretch BAR setting did not save and load correctly.

fix: Holding SHIFT+SOUND to save a sound now works during playback.

projects

fix: sidechain settings were not loaded correctly.

fix: project erase did not reset pattern length.

fix: Project load did not reset pattern position.

punch-in FX

fix: Weird behaviour of punch-in FX when sequencer is stopped.

fix: punch-in FX ENTER could sometimes cut out very long notes.

fix: out of sync time-stretched samples when using tape-stop-punch in FX.

misc

fix: punch-in FX ENTER could sometimes cut out very long notes.

fix: display BAT when powering down due to critically low battery

fix: Improved handling of disk full when saving settings and pattern data.

fix: loop mode sample start position was off when using external clock or tape-stop punch in fx.

crashes

fix: crash when playing song with external clock.

fix: crash when switching project with a queued scene change.

fix: crash when pressing (shift) + (groupA) in song mode while the song is playing.

fix: error 'pattern 30' when loading a pattern.

os 2.o

stack effects, make a beat from a beat or combine samples, all using the new resampler.

just hit (sample) then press (plus) until RSP shows on screen. you can then hold (shift), press a pad then press (play) to sample the length of the currently selected pattern. you can even switch groups after you’ve engaged hands free sampling to sample sounds from another group. 

learn more about resampling here

use song mode to chain scenes together.

hold main then press (enter) to open the song list editor, you can then view and edit the current song position as well as add up to 99 different song positions. combining that with a maximum pattern length of 99 bars that means you can create songs as long as 9,801 bars! this fight might just need some wraps...

learn more about song mode here

sometimes you need both hands to play an instrument, and you want to sample it. use hands free sampling and let ko2 hold the buttons for you.

when sampling hold (shift) and press a pad to engage hands free sampling. you can then sing, play, shout and strum, ko2 will take care of the rest. once you are done just press sample and ko2 will stop sampling. remember to adjust your threshold and gain and combine hands free sampling with the new resampling feature send your beat back into the ring.

learn more about hands free sampling here

kick and bass not getting along? sidechain will duck the volume of the bass when the kick comes in.

press (shift) and (fx) to open output, then (plus) to switch to sidechain. select the sidechain source by holding a group pad and selecting a sound on the pads, then select the destination groups by holding (shift) and pressing the group pads. dial in how hard they punch by adjusting the length and shape with (knobx) and (knoby) respectively.

learn more about midi sidechain here

with increased polyphony, ko2 goes from 12 mono/6 stereo sounds to up to 16 mono and 12 stereo sounds.

no need to pull your punches anymore but watch out for time stretched, stereo and high pitched samples as they may reduce the polyphony.

struggling to land your kicks on time? what about adding one bar loops? try out the new larger note intervals, now you can hit your target every time and record perfect four on the floors.

ko2 now supports 1/1, 1/2 and 1/4 timing intervals!

bonus! hold (shift) while in timing to latch the note repeat so ko2 can hit the hats for you while you focus on the kick and snare.

learn more about larger note intervals here

ko2 now supports midi thru so it can pass notes along to other machines.

hold (shift) and press (erase) to open the system settings then press (plus) to go to mid, then (enter), press (plus) twice to go to thr, then (enter) again and then set it to on with (plus) and (enter) once more. boom! now any incoming midi messages will be passed along to midi out and usb.

ko2 also features a bunch of midi improvements such as:
a system setting for midi in and out channels
sending and receiving program change messages
a new midi note map so you can play any sound on any pad with an external controller
incoming pitch bend and mod wheel messages now affect sample playback
Pads now by default send midi notes to the system midi channel
the sound edit midi channel now changes the midi in channel for that pad too

learn about all the midi changes here

as well as all the huge features we have added there are also smaller ones,
here is a comprehensive list of the rest.

(main) + numpad can now always switch to any scene 1-99.hold (SHIFT) + (SOUND) two seconds to save sound edits.changes are now saved to disk also during sample playback. this means we no longer need the brain icon to show unsaved changes.in MAIN mode, (minus) and (plus) now moves by steps even after bar 10. Since a position like 10.1.2 will not fit on the display, steps are shown with the TIC display.sound pitch setting is now step-less.snap to zero crossing when changing TRIM IN on mono sounds.sync live project switch to bar end.made swing a project setting instead of a global setting.system setting 412: SEQ/SCN/PTN. Sync scene changes with pattern end.

update your device here

# guide conventions

((5))

GUIDE CONVENTIONS

sometimes you will need to press buttons in sequence, sometimes in combination. these illustrations and texts will help you to follow along in the guide.

to press a button, tap it and then release. to hold a button, press it and keep it pressed down. many of the knobs and buttons have different functionality depending on the
context.

single press

a single button in a cell is for a SINGLE press.

COMBINATION press

multiple buttons in a cell divided by a plus is for a combination press.

sequence press

multiple buttons in a cell divided by an arrow is for a sequence press.

SINGLE hold

the hold icon above a single button means you’re supposed to long hold.

COMBINATION HOLD

multiple buttons divided by a plus is for a combination hold.

SEQUENCE HOLD

HOLD THE FIRST BUTTON, THEN RELEASE AND HOLD THE SECOND BUTTON.

SINGLE tap

the tap icon above a single button means you’re supposed to press the button and release it.

tap and hold

multiple buttons divided by a plus is for a combination tap and hold.

tap, then hold

multiple buttons in a cell divided by an arrow is for a sequence hold.

pads

the pads will show when any pad can be pressed or a value typed using them.

pads blinking

when the pad leds are blinking, it’s displayed with small red dots above the pads.

PRESS pads

when pads should be pressed to start an action on the device a hand will show to describe this.

X / Y PARAMETER

when a knob is shown in a cell this describes TURNing the KNOB.

Fader positions

the fader icon will show either one of the three settings: upwards for maximum / downwards For minimum / middle for the mid setting.

TIME CODE VIEW

when the time code view is shown in a cell the function of that view is described below.

icon view

icons that are lit up on the display in some scenarios will show in the bar running across the top.

GROUP KEYS

the group keys showN without their respective icons when they are used to access groups.

GROUP KEY FUNCTIONS

the group keys showN with their respective icons beneath them when the group keys are used for a combination hold or press.

# hardware overview

((1))

hardware overview

powerful sampler and composer 999 sample slots 12 sample pads and 4 group pads line in and out sync in and out MIDI in and out usb MIDI and power high resolution sequencer 6 built-in fx punch-in fx 2.0™

EP–133 K.O.II is a 128 MB sampler and composer. just like it's pocket-sized predecessor PO-33 K.O!, this sampler is a mighty contender on the stage, in the studio and in the ring. sample directly from your favorite source using the built in mic or 3.5 mm input jack.

k.o.ii HIGHLIGHTs!

front

back

left

right

1.1

inputs/outputs

top side

on the top side of the unit, you will find all the inputs and outputs.

use the 3.5 mm stereo input to connect external instruments, tape recorders or audio from your phone. use the output to connect a stereo 3.5 mm cable to your sound system, mixer/soundcard or headphones.

input

use the 3.5 mm stereo input to connect external instruments, vinyl players, tape recorders or audio from your phone.

output

use the output to connect a stereo 3.5 mm cable to your sound system, mixer/soundcard or headphones.

((1)) input example

sample from your phone by connecting it using a 3.5 mm cable into the 3.5 mm input.

((2)) input example

connect a turntable and sample your favorite record. make sure to use an RIAA amplifier or a turntable that features a built-in amp.

((3)) output EXAMPLE

connect headphones directly into the output to monitor your beats.

((4)) output EXAMPLE

connect a speaker directly into the output to knock out a crowd with your beats.

((5)) output EXAMPLE

connect ko2 directly to a computer over usb to playback and record sound straight from ko2 to the computer.

((6)) output EXAMPLE

connect two ko2s to kosidekick for the ultimate portable production and performance setup.

1.2

sync connections

sync in and out offers great flexibility to play with external gear.

dual 8th note

use dual 8th note output to sync two pocket operators using a splitter cable. clock is sent on both tip (left channel) and ring (right channel).

16th note

use 16th note 'eurorack style' sync with start/reset on the ring (right channel). you can also use it to add another K.O.II in perfect sync.

sync 24

use sync24 to link up your vintage drum machines.

pro-tip: this requires a 3.5mm to din sync cable. a midi cable will not work.

midi

use midi-in and out to connect K.O.II to any midi controllable devices, as well as receive midi from any midi controllers, like a piano or drum pad.

usb-c

the usb-c port allows K.O. II to work as a midi device with clock and transport.

firmware

the usb is also used to transfer samples to and from your EP and update firmware.

file transfer

use the EP SAMPLE TOOL to carefully and automatically convert any sample/bitrate combo using a high-quality resampler then download them straight onto the device.

# power on

((2))

power on

((1)) open lid

LIFT OFF THE TOP LID TO REVEAL THE battery compartment

((2)) insert batteries

insert 4x fresh AAA batteries.

((3)) switch on

slide the orange power-switch on the top right to power on the unit.

((4)) on

when switched on, the led screen will light up immediately.

usb

you can also power the unit via a standard usb-c cable (5V / min 1A). we recommend using a quality "USB-IF" compliant charger.

update

keep your K.O. II up-to-date with the latest firmware by going to the update utility.

# screen

((3))

screen

K.O.II has a custom display that features 66 unique icons. each icon represents a different feature within the device and helps you better navigate the user interface.

the table below lists every icon along with what it represents.

### 3.1 icon map

icon map

# workflow

((6))

workflow

K.O.II has 9 projects, each with 4 groups, each group has 99 patterns which can be arranged into a total of 99 scenes.

project

a project is the composition you are working on, think of it as a song.

K.O.ii has space for 9 different projects.

group

a group is a collection of samples. these are the sounds that you create your patterns with. each group holds a collection of 12 samples that can be sequenced in a group specific pattern. each project holds four groups with pad settings saved per project.

pattern

each group can hold up to 99 patterns per project with a maximum length per pattern of 99 bars. you can arrange these patterns into 99 scenes.

scene

a scene is an arrangement of patterns, they’re the sections that make up a composition. each project holds up to 99 scenes. using scenes allows you to quickly build-up the structure of a song, use the instant commit feature to experiment with variations without ever having to stop the music.

song position

the song position sits independent from the scenes, patterns and groups, allowing you to chain scenes together to create a song. when in song mode ko2 will then increment through the song positions playing the scenes in the order you have dictated.

### 6.1 commit

commit

use commit to create an arrangement of patterns then ‘commit’ this arrangement as a scene. start a new one with the previous scene as a basis for the new one.

commit is also a great way of duplicating the current scene so you can add variations to your patterns!

commit allows you to save something you like before moving on to the next idea. commit before punching in new sounds to quickly build up the structure of your song!

6.2

song mode

song mode will play through the song positions from 1-99. each song position can hold a scene.

the length of the song position is the same as the longest pattern in the scene.

the song list editor is used to assign scenes to song positions.

# get started

### 7.1 make a beat from scratch

((7))

get started

make a beat from scratch!

((1)) new project

to get started making a beat, first load up a new project. 

hold (main) and one of the pads (1-9) to select an empty project.

when fresh out of the box, your K.O.II will come with projects 1-5 populated with sounds and projects 6-9 completely empty.

((2)) load some sounds

press a few pads in an empty project and you will notice that the pads do not have any sounds. lets fill them up with some! 

press (sound) to go to sound mode, then select group (GROUPA) and one of the pads. 

use (minus) and (plus) to scroll through the available sounds. you will notice that the screen shows a number. this is the number of the sample for the corresponding pad.

fill out the remaining pads using whichever sounds you like the most!

you can find out more about how samples are stored on K.O.II in the sounds section of the guide.

((3)) groups

as K.O.II has 4 groups, we recommend keeping each group as a selection of instruments or parts. 
 
group (GROUPA) for drums.
group (GROUPB) for bass.
group (GROUPC) for melodies.
group (GROUPD) for loops and samples (keep this one empty for later).

this layout is of course optional and you can put whatever sounds you want into each group.

try loading each group up with different samples!

((4)) main

now that we have some sounds, lets turn them into a beat!

press (MAIN) to go to the main mode. you will notice that the screen changes to show the current “step”.

a step is a division of time and allows you to see where you are in your beat.

((5)) record a beat

tap (record) then (play) to start recording!

you will hear a four beat count-in then the K.O.II will start recording. hit the pads and punch out a beat!

once you are done press (play) to stop the beat, alternatively you can press (record) to keep the beat going but stop recording.

once you have finished recording drums press (shift) and (main) to commit it! this will allow you to quickly build up the structure of a song!

((6)) pattern length

by default new patterns on K.O.II will be set to 1 bar (ln.1). 

if you want a longer pattern just hold (record) then press (plus).

((7)) add a bassline

next, lets add a bassline!

if you followed along with the recommendation in step 3, you should have some bass sounds in group (GROUPB). 

press group (GROUPB) to play some bass sounds.

select one that you like then press (keys) to play that sound across the pads like a keyboard!

if you’d like to change the scale of the pads, this can be done in system settings.

((8)) record a bassline

press (play) to hear your beat and practice over it with your bassline.

once you have something you like, pause it by pressing (play) again. now tap (record) and (play) to get another four beat count in and record it in!

if your bassline is longer than the pattern and you find yourself playing over it, make sure to increase your pattern length by holding (record) and pressing (PLUS).

once you have finished recording a bassline press (shift) and (main) to commit it! this will allow you to quickly build up the structure of a song!

((9)) add a melody

next, lets add a melody!

if you followed along with the recommendation in step 3, you should have some melodic sounds in group (GROUPC). 

press group (GROUPC) to play some melodic sounds.

select one that you like then press (keys) to play that sound across the pads like a keyboard!

if you’d like to change the scale of the pads, this can be done in system settings.

((10)) record your melody

press (play) to hear your beat and practice over it with your melody.

once you have something you like, pause it by pressing (play) again then you can tap (record) and (play) to get another four beat count in and record it in!

if your melody is longer than the pattern and you find yourself playing over it make sure to increase your pattern length by holding (record) and pressing (PLUS).

once you have finished recording a melody press (shift) and (main) to commit it! this will allow you to quickly build up the structure of a song!

((11)) let's sample!

sampling is a great way to record your own sounds into K.O.II!

if you followed along with the recommendation in step 3, group (GROUPD) should be empty.

press group (GROUPD) then hit (SAMPLE) to enter sample mode!

((12)) record sample

the pads will flash to let you know that they can be sampled to. press one and sing, shout or rock out into the mic or line in!

as soon as you let go it will stop sampling and you can press the pad again to hear your sample.

((13)) add it to beat

press (main) to go back to main mode and add the sample into your beat. 

now you can use the same techniques we used in the previous sections to play your sample(s) into your beat!

((14)) add some fx

now that you have a sick beat you can add some FX to it!

press (fx) to open the fx menu. here you can send each group to one master fx.

turn the fader up and use (minus) and (plus) to switch between the available fx.

((15)) punch-in fx

now press (play), hold down (FX) and press the pads.

this will add punch-in fx which allow you to quickly and easily perform with your beat!

((16)) commit your beat

press (shift) and (main) to commit your beat. 

this will save the current patterns as a scene and create a new scene! 

committing your beat is a great way to quickly build the layers in a song. or even starting something fresh!

when you commit it will duplicate your current scene allowing you to quickly add variations on your beat without overwriting the previous section.

commit as many times as you like while you are making a beat to quickly build out the structure of your song!

THAT'S IT!

### 7.2 sequencing a beat from scratch

sequencing a beat from scratch!

((1)) new project

to get started making a beat, first load up a new project, and press play. 

hold (main) and one of the pads (1-9) to select an empty project.

when fresh out of the box, your K.O.II will come with projects 1-5 populated with sounds and projects 6-9 completely empty.

((2)) load some sounds

press a few pads in an empty project and you will notice that the pads do not have any sounds. lets fill them up with some! 

press (sound) to go to sound mode, then select group (GROUPA) and one of the pads. 

use (minus)/(plus) to scroll through the available sounds. you will notice that the screen shows a number, this is the number of the sample on a pad.

fill out the remaining pads using whichever sounds you like the most!

you can find out more about how samples are stored on K.O.II in the sounds section of the guide.

((3)) groups

as K.O.II has 4 groups, we recommend keeping each group as a selection of instruments or parts. 
 
group (GROUPA) for drums.
group (GROUPB) for bass.group (GROUPC) for melodies.group (GROUPD) for loops and samples (keep this one empty for later).

this layout is of course optional and you can put whatever sounds you want into each group.

try loading each group up with different samples!

((4)) main

now that we have some sounds, lets turn them into a beat!

press (MAIN) to go to the main mode. you will notice that the screen changes to show the current “step”.

a step is a division of time and allows you to see where you are in your beat.

((5)) go to step ((1))

hold (shift) and (minus) until the display shows 1. 1 .1

this brings you to the first step in the pattern.

((6)) record to a step

hold (record) and press on one of the pads to record that pad to a step.

((7)) navigating the sequencer

press (minus) and (plus) to navigate forwards and backwards in your pattern.

((8)) add some drums!

try placing a kick on 1.1.1 / 1.2.1 / 1.3.1 and 1.4.1 - this is called a ‘four on the floor’.

then a snare on 1.2.1 and 1.4.1 - this is called a ‘back beat’.

((9)) change the note interval

to change the note interval (number of steps per bar). press (timing) and turn (knobx). 

by default K.O.II will be set to a note interval of 1/16, but note intervals of 1/8, 1/8T (triplet), 1/16, 1/16T (triplet) and 1/32 are available.

having a higher note interval allows you to sequence in more detail whereas having a low note interval is great for fast sequencing.

((10)) change the swing

to change the swing. press (timing) and turn (knoby). 

use swing to add grooviness to your beat!

note interval and swing apply before recording and not after, for more info see the timing section.

((11)) note repeat

hold (timing) and press a pad to repeat that pad with the chosen note interval.

use it on a hi-hat to quickly record hats into your beat!

to record with a four beat count-in, tap (record) then (play).

((12)) pattern length

by default new patterns on K.O.II will be set to 1 bar (len:1). 

if you want a longer pattern just hold (record) then press (plus).

((13)) add a bassline

next, lets add a bassline!

if you followed along with the recommendation in step 3, you should have some bass sounds in group (GROUPB). 

press group (GROUPB) to play some bass sounds.

select one that you like then press (keys) to (play) that sound across the pads like a keyboard!

if you’d like to change the scale of the pads, this can be done in system settings.

((14)) record a bassline

press (play) to hear your beat and practice over it with your bassline.

once you have something you like, pause it by pressing (play) again. 

then, hold (record) and press on one of the pads to record that pad to a step.

alternatively, you can tap (record) and (play) to get a four beat count in and record it in!

if your bassline is longer than the pattern and you find yourself playing over it make sure to increase your pattern length by holding (record) and pressing (PLUS).

((15)) add a melody

next, lets add a melody!

if you followed along with the recommendation in step 3, you should have some melodic sounds in group (GROUPC). 

press group (GROUPC) to play some melodic sounds.

select one that you like then press (keys) to play that sound across the pads like a keyboard!

if you’d like to change the scale of the pads, this can be done in system settings.

((16)) record your melody

press (play) to hear your beat and practice over it with your melody.

once you have something you like, pause it by pressing (play) again. 

then, hold (record) and press on one of the pads to record that pad to a step.

alternatively, you can tap (record) and (play) to get a four beat count in and record it in!

if your melody is longer than the pattern and you find yourself playing over it make sure to increase your pattern length by holding (record) and pressing (PLUS).

((17)) let's sample!

sampling is a great way to record your own sounds into K.O.II!

if you followed along with the recommendation in step 3, group (GROUPD) should be empty. 

press group (GROUPD) then hit (SAMPLE) to enter sample mode!

the pads will flash to let you know that they can be sampled to. press one and sing, shout or rock out into the mic or line in!

as soon as you let go it will stop sampling and you can press the pad again to hear your sample.

((18)) add it to your beat

press (main) to go back to main mode and add the sample into your beat. 

now you can use the same techniques we used in the previous sections to play your sample(s) into your beat!

((19)) add some fx

now that you have a sick beat you can add some FX to it!

press (fx) to open the fx menu, here you can send each group to one master fx.

turn the fader up and use (minus)/(plus) to switch between the available fx.

commit your beat!

press (shift) and (main) to commit your beat. 

this will save the current patterns as a scene and create a new scene! 

committing your beat is a great way to quickly build the layers in a song. or even starting something fresh!

when you commit it will duplicate your current scene allowing you to quickly add variations on your beat without overwriting the previous section.

commit as many times as you like while you are making a beat to quickly build out the structure of your song!

extra! don’t forget to add punch-in-fx

now press (play), hold down (FX) and press the pads.

this will add punch-in fx which allow you to quickly and easily perform with your beat!

THAT'S IT!

# modes

((8))

modes

the device operates in three main modes: (SOUND), (MAIN) and (TEMPO).

### 8.1 sound

sound

SOUND is where you decide which sample to assign to each pad and delete stuff you don't need, as well as modify basic parameters like amplitude and pitch.

K.O.II can store up to 999 samples, or 128 MB, whichever comes first.

load sample

to load a sample onto a pad, select a group (GROUPA) - (GROUPD) then a pad.

change sound

press (minus) or (plus) to change the sound on that pad.

enter sound

alternatively, hold (sound) and enter the number of the sound you want using the pads.

pro-tip! you can preview the name of a sample by holding down the pad while in sound mode. a sample will only have a name if imported or renamed using the EP sample tool.

amplitude

the (knobX) knob controls amplitude/volume (AMP).

pitch

the (knoby) knob controls pitch (PTC).

jump in tens

pressing (SHIFT) and 
(minus)/(plus) will jump up the sample numbers in tens rather than one by one.

default sample

kicks are stored from 1-99. 
snares from 100-199. 
hi-hats from 200-299. percussion from 300-399.
bass from 400-499.
melodic sounds from 500-599.

out of the box K.O.II will come loaded with over 300 samples but you can of course record your own or download them to the device by using the EP sample tool!

SOUND mode also allows you to edit the sounds. these edit modes affect the sound only within the selected project and do not write-back to the sample itself.

### 8.2 sound edit

sound edit

select the sound you wish to edit, then press (SHIFT) and (SOUND). within this menu you can then navigate through 6 edit modes. 

use (minus) and (plus) to navigate through the edit modes.

enter sound edit

press (SHIFT) and (SOUND) to enter sound edit.

change edit mode

use (minus) and (plus) to change the sound edit mode.

save sound edits

hold (SHIFT) and (SOUND) for two seconds to save any edits you have made to the current sound.

#### 8.2.1 sound mode

sound mode

sound

sound is where you can adjust the way a sample is played and where it should sit in your stereo mix.

play mode

the (knobX) knob controls the play mode of the sample between oneshot, key and legato.

oneshot

oneshot is monophonic, and plays the whole sample, one at a time.

key

key is polyphonic, and allows you to play multiples of the same sample at once.

perfect for playing the same sample across a keyboard!

legato

legato is monophonic, and plays a sample one at a time. when changing the note while being held, it will continue playing from the same point as it was left off.

pan

the (knobY) knob controls pan. pan gradually adjusts whether the sample is played on the left, right or center audio channels.

#### 8.2.2 trim

trim

trim helps you to fine tune the start and end points of your sample, so that you can cut straight to the bit you wanted!

start and end points

the (knobX) knob controls the starting point of the sample.

the (knobY) knob controls the length of your sample.

crop sample

hold (shift) and (sound) while in the trim menu to save the trim points to the sample, this will overwrite the file and cannot be undone.

#### 8.2.3 envelope

envelope

envelope helps adjust the playback of your sample, so that it fades in and out exactly as you need it to. creating soft pads or snappy snares!

attack and release

the (knobX) knob controls attack. attack allows you to fade in your sample or have it play exactly how it was recorded.

the (knoby) knob controls release. release will continue playing the sample after you let go of the pad or will cut it off immediately.

#### 8.2.4 time

time

time mode is a powerful tool which allows you to match the bpm of your sample to that of your project!

time stretch mode

the (knobX) knob sets the time stretch mode (BPM, BAR or reverse).

bpm

BPM will stretch the sample to match the project tempo.

to do so it requires you to set the sample bpm.

BAR

BAR will stretch the sample, automatically fits it to the chosen time division of the project’s bpm.

if you choose 1 bar it stretches your sample to be 1 bar long. if you choose 2 bars it stretches your sample to be 2 bars long.

reverse

reverse will reverse the sample, playing it backwards.

tempo

the (knobY) knob sets the sample tempo (BPM) or sample length (BAR).

sample tempo

pro-tip! to find the tempo of incoming audio hold (sample) and (tempo).

#### 8.2.5 midi

midi

midi is a protocol that allows you to connect your K.O.II to other musical instruments, 
controlling your K.O.II or the instrument or both!

midi channel

the (knobX) knob controls the MIDI channel the pad receives and sends to. this allows you to connect a series of external music devices and send note data to them all individually from different pads!

root note

the (knobY) knob controls the MIDI root note. this allows you to set the MIDI root note of your sample and ensure that the root note on the device matches with the root note on the sample.

for more information on how to configure midi, as well as what midi messages are sent and received, please see the
midi chart.

#### 8.2.6 mute group

mute group

a mute group allows you to group together all the samples you do not wish to have playing at the same time. when playing the samples in a mute group only the last pressed sound will play, cutting off any others that came before it.

pads in mute groups

if no pad is selected, all the pads will flash. press a pad to add it to the mute group. if a pad is in a mute group it will light up.

### 8.3 main

main

think of main as your home screen, the place you always want to return to. it's here that you control your projects, scenes, and patterns. this is also where you arrange your songs, record, and perform them live.

K.O.II sequences per-step. 
to navigate through steps, press (minus) and (plus).

select scene

hold MAIN to select scene 01-99 with (minus) and (plus).

pro-tip! you can also switch to a specific scene by holding (main) and typing the number on the numpad.

select pattern

hold group (groupA) - (groupD) and press (minus) and (plus) or type the number in with the pads to select pattern.

pro-tip! hold multiple groups to adjust all their patterns at once.

fader

by default the fader controls group level but can be reassigned by holding (FADER) and selecting any of the options printed above the pads.

new pattern

press (shift) and (GROUPA) to find the next available empty pattern.

undo

press (SHIFT) and (GROUPB) to undo. 

when an undo is possible the umbrella will light up to let you know.

copy

press (SHIFT) and (GROUPC) to copy. 

press once for BAR and twice for pattern. the current bar will be copied.

pro-tip! you can navigate through bars using (SHIFT) and (minus) and (plus).

paste

press (SHIFT) and (GROUPD) to paste.

commit

press (SHIFT) and (MAIN) to (commit). 

this will duplicate the current scene and allow you to save your ideas before moving on to the next one!

change project

hold (MAIN) and select pads 1 - 9 to change project.

input gain

turn the (KNOBX) knob to adjust the input volume.

send level

turn the (KNOBY) knob to adjust the internal fx send level.

8.3.1

song mode

sometimes you want to sit back and have a song play itself, that’s where song mode comes in!

songs can have a maximum length of 99 scenes.

enter song list editor

hold (main) then press the (enter) pad to enter the song list editor.

song position

when in the song list editor the screen will show the current song position.

next song position

to go to the next song position press (plus) and to go to the previous song position press (minus).

add to song list

hold (shift) and press (groupa) to add a new scene to the song list. when you first make a song arrangement there will only be one scene in the song list.

change scene

hold (shift) and press (minus) or (plus) to switch the scene that will play on the current song position.

cut scene

while in the song list editor hold (shift) and press (C) to cut the current scene to the clipboard.

insert scene

hold (shift) and press (D) to insert a scene into the selected song position.

play

press (play) to play the song from the currently selected song position.

play from start

press (shift) and (play) to play the song from the start.

### 8.4 tempo

tempo

basement jaxx said that if you raise the song three bpm from where you think it should be, it will be a hit. try it out by setting the tempo of your song with this button.

tempo

press the (tempo) button to enter tempo mode.

pro tip! tap (tempo) to tap tempo

bpm

the (knobx) knob controls bpm.

the lowest tempo is 40 bpm and the highest is 399 bpm. 

pro-tip! the (knobX) knob has a range of 60 bpm to 180 bpm, but if you type in the numbers you can go all the way down to 40 bpm and all the way up to 399 bpm!

metronome volume

the (knoby) knob controls record metronome volume.

pro-tip! if you’d like to turn the metronome on while playing as well you can do so in system settings.

enter bpm

hold (TEMPO) and type the desired tempo value with the number pad. 

pro-tip! use the ( . ) to add decimal values of tempo, for example 120.51 bpm.

#### 8.4.1 time signature

time signature

set the time signature to something as simple as 4/4, or something really weird.

time signature

press (MAIN) and (TEMPO) to change the time signature for the current pattern

change signature

use the (knobx) and (knobY) knobs to adjust the time signature

#### 8.4.2 tempo match

tempo match

if you hear something you like and want to match the tempo of your song to it you can detect the tempo of the audio played through the line-in or built-in mic!

tempo match

hold (SAMPLE) and (TEMPO) to start listening for the incoming audio, then play any audio into the device through the line-in or into the mic. K.O.II will listen, find the tempo, display it on screen and then set the project tempo to match.

tempo match

# play and record

((9))

play and record

*this is not an app

### 9.1 live record

live record

ko2 allows for fast and easy live recording so you can quickly get your ideas down.

record with count in

while K.O.II is not playing press and release (record) then press (play) to hear a four beat count-in and start recording.

hit the pads to record your beat!

stop recording

once you are done recording press (play) again to stop the recording and pause your beat.

otherwise, press (RECORD) to keep the beat going but stop recording.

record without count in

if you want to start recording without a count-in

you can press (RECORD) and (PLAY) together.

record from pattern start

to record from the start of the pattern, rather than the current bar press (record) to enter record arm then (shift) and (play).

pattern length

by default K.O.II will be set to a 1 bar pattern length. 

if you want to record a longer pattern press (RECORD) then (minus) or (plus).

K.O.II supports pattern lengths of up to 99 bars per group.

duplicate pattern length

to duplicate the length of your pattern press (record) to enter record arm then hold shift and (plus).

this will duplicate notes in the existing pattern and double the length.

change pattern length while playing

while playing you can change pattern length on the fly by holding (RECORD) and pressing (MINUS) or (PLUS).

overdub

to record over an existing pattern, press (PLAY) to start the pattern then hold (RECORD) and hit the pads to record notes into the beat.

in case you make a mistake you can easily erase it! find out more in the next sections.

overwrite record

to overwrite an existing recording press (record), (erase) and (plus).

this will delete the existing recording and overwrite it with the new one.

### 9.2 step sequence

step sequence

K.O.II sequences per step. this allows you to get super precise sequences when using smaller note intervals, while also punching-in basic sequences super fast, at higher note intervals.

step

while K.O.II is not playing, use (minus) and (plus) to step through the steps in your pattern.

record to a step

hold (RECORD) and press a pad to record the chosen pad to that step.

when a pad is recorded to a given step it will light up.

erase note

you can remove unwanted sounds and notes by holding (ERASE) then pressing the pad corresponding to the unwanted note or sound.

erase note while playing

you can also remove unwanted sounds and notes by holding (ERASE) while playing then pressing the pad corresponding to the unwanted note or sound.

free nudge

when in free time hold (SHIFT) and the desired pad then press (minus) or (plus) to nudge the recorded note in ticks.

pro-tip! a tick is the smallest time increment that the sequencer in K.O.II uses. it operates at 96 ppqn (parts per quarter note), meaning there are 96 ticks per beat. this means that the step resolution of K.O.II is 24 ticks, same as OP–Z.

quantised nudge

when in quantize mode hold (SHIFT) and the desired pad.

then press (minus) or (plus) to nudge the recorded note in steps.

note velocity

hold (shift) and turn (knobx) to change the note velocity of all notes in a chosen step.

note duration

hold (shift) and turn (knoby) to change the note duration of all notes in a chosen step.

the maximum note duration is one bar and the minimum is one tick.

### 9.3 keys

keys

sometimes you love a sample so much you want to play it all the time. KEYS mode let’s you play a selected sample across a 12 note keyboard, either on your K.O.II’s pads or a connected midi keyboard.

active keys

select a pad you want to activate then press (KEYS) to chromatically transpose the selected pad across the 12 pads.

octave

hold (KEYS) and press (minus) or (plus) to select the octave.

when exceeding the highest octave, the notes from the same octave will repeat allowing you to keep playing.

root note

holding (KEYS) and selecting a pad will transpose the scale.

record note

to record a note to a step, hold down (record) and press the pad that you wish to have play on that step.

erase note

you can remove unwanted sounds and notes by holding (ERASE) then pressing the pad corresponding to the unwanted note or sound.

live record notes

to live record a note start recording by pressing (RECORD) then (PLAY) and punch out some notes into your pattern.

### 9.4 fader

fader

the fader allows you to control and record various effects and parameters in your pattern.

fader parameter

hold (FADER) and a pad to change the fader parameter of your chosen group.

the fader assignments can be found printed above the pads.
pro-tip: hold (fader) to see the current recorded fader automations. assignments with automations will blink.

rec fader movement

fader movements can also be recorded.

holding (RECORD) and moving the FADER will record the fader’s movement into your beat.

pro-tip: when step sequencing, hold (record) and move the fader to record the position of the fader to the current step. this is latching, not momentary.

reset virtual fader

press (SHIFT) and (FADER) to reset the fader’s virtual position to the default position for all fader assignments in the current group (RES shows on screen).

pressing this combo again will undo the reset (SET shows on screen).

erase fader automation

while K.O.II is not playing, holding (ERASE) and (FADER) for 2 seconds will reset all fader levels for the selected group and pattern (FDR blinks on screen followed by DEL).

precise fader adjustments

holding (SHIFT) and moving the fader will adjust the value of the fader more precisely,

allowing you to get just the right sound!

group project volume

holding a group pad and moving the fader will change the group’s project volume. this is independent from the fader’s “level” assignment which controls the pattern’s volume.

the group project volume can not be automated, while the pattern level can be. any changes to the project level apply across all patterns and scenes in the current project.

per-pad pattern copy and paste

to copy the pattern on a pad you can hold the pad then press (shift) and (groupc) to copy the pad’s pattern.

paste the pattern to another pad by holding a pad, pressing (shift) and (groupd).

### 9.5 copy paste

copy / paste

copying is a great way of transferring a pattern or bar to another section, or a sound from one pad to another!

copy

when in main, press (SHIFT) and (GROUPC) to copy (press once for BAR and twice for pattern. the current bar will be copied. 

pro-tip! you can navigate through bars using (SHIFT) and (minus)/(plus)

paste

press (SHIFT) and (groupD) to paste.

copy sounds

you can also copy sounds!

when in sound mode you can copy a sound from one pad to another by pressing (SHIFT) and (GROUPC) to copy from the currently selected pad, then selecting the pad you wish to paste to and pressing (SHIFT) and (GROUPD) to paste your sound to it.

per-pad pattern copy and paste

when in sound mode you can copy all sounds in a group by pressing (SHIFT) and (GROUPC) twice.

you can then select the group you wish to paste to and press (SHIFT) and (GROUPD) to paste your sounds to it.

### 9.6 erase undo

erase / undo

ERASE removes recorded regrets, fader failures, whole projects, scenes, patterns, samples, or everything you’ve ever recorded.

playback erase

during playback, hold (ERASE) and the pad you wish to clear to remove note(s) or pad(s) played as the pattern runs. 

pro-tip! hold down multiple pads while pressing erase to erase them all at once - this can even be done with notes recorded in keys mode!

erase note

while K.O.II is not playing, hold (erase) and a pad until TRK blinks on the screen to erase all the notes recorded on that pad in the pattern.

erase pattern

hold (ERASE) and the group pads (GROUPA) - (GROUPD) until PTN blinks on the screen to erase the current patterns.

erase scene

hold (ERASE) and (MAIN) for two seconds, if the current scene is empty and not included in the song list, it will be deleted and DEL will blink on the screen. otherwise, the contents will be cleared and CLR will show instead.

erase sound

hold (ERASE) and (SOUND) until SND blinks on the screen to permanently remove the currently selected sample from device memory.

system settings

pressing (SHIFT) and (ERASE) will open the system settings. use (minus)/(plus) and ENTER to navigate the settings tree then ENTER to set your option. 

alternatively the codes can be typed using the numpad and ENTER to confirm.

undo

pressing (SHIFT) and (GROUPB) will undo - when an undo is possible the umbrella will light up to let you know.

erase fader automation

while K.O.II is not playing, holding (ERASE) and (FADER) until FDR blinks on screen will erase fader automation for all assignments

and set the fader position for all assignments to their current position (FDR blinks on screen followed by DEL).

erase fader movements live

while playing, holding (ERASE) and (FADER) will delete fader movements for all fader assignments.

this will set the fader position for all assignments to their position when (ERASE) and (FADER) were first pressed.

erase individual fader automation

to erase fader movements for a particular fader assignment hold (erase) + (fader) and the pad for that assignment.

### 9.7 offset notes

offset notes

sometimes you want to add a little more feeling or expression to your beat, or even just get weird. offsetting notes allows you to move them around to just the right point!

note offset

while K.O.II is not playing, hold (SHIFT) and the desired pad then press (minus) or (plus) to nudge the note.

when in quantize mode the notes will move corresponding to the note interval. 

when in free time, the notes will move outside of the grid between the note intervals.

offset all notes

to nudge all notes on a pad you must enter timing correct by pressing (shift) and (timing).

then you can hold the pad and press (minus) or (plus) to move all notes recorded to it back or forward.

# functions

((10))

functions

10.1

sample

for those of you that are new to this, a sample is a short audio recording that can be used in a track.

capture sounds around you with the built-in microphone, or use the stereo line-input to sample your favorite synthesizer, connect your CM–15 mic, even your phone!

sampling is a powerful tool that can make your track truly unique. sample something then record it using K.O.II’s powerful built in sequencer!

enter sample mode

to record a sound, press (SAMPLE) to enter sample mode. you will see all the buttons light up. the leds will blink to let you know you are in sample mode.

sample

press and hold a pad while in sample mode to start recording your sample. once a sample has been recorded to a pad it will stop blinking and light up to let you know it has been recorded to.

pro-tip! after recording, audition a sample by pushing the pad again.

add more samples

while in SAMPLE mode, you can continue capturing samples to additional pads.

stereo/mono/l/r

pressing (minus) or (plus) when sampling allows you to choose between:

mic
line in mono (in)
line in stereo (in)
resample mono (rsp)
resample stereo (rsp)
line in left mono (L.IN)
line in right mono (R.IN)
usb mono (usb)
usb stereo (usb)

input level

the (knobX) knob controls input level.

threshold

the (knobY) knob adjusts the threshold allowing you to trigger the recording to start only when you make just the right amount of noise.

re-take sample

record something that’s not quite right? get a second chance by pressing sample again and retaking it!

hands free sampling

run out of hands? not a problem! press (shift) and a pad to have ko2 hold the pad for you! 

try combining this with the resample source to sample chords and individual sounds.

resample pattern

while in sample mode, engage hands free sampling by holding (shift) and pressing a pad then press (play).

ko2 will then sample the length of the currently selected pattern.

pro-tip! jump straight into sampling while your pattern is playing to start sampling it with the resample source!

resample bars

to sample a specific number of bars just press (minus) or (plus) when hands free sampling is engaged.

this will then sample the number of selected bars once (play) has been pressed.

stop sampling

to stop the hands free sampling, press (sample) while a sample is being recorded.

exit sample mode

exit sample mode by hitting (MAIN).

permanently delete sample

samples are stored automatically and can only be deleted by removing them in the SOUND menu.

holding (ERASE) + (SOUND) will delete the currently selected sample from the device.

resample

use resample to take multiple samples and combine them into one longer sample.

you can also use resample to stack and time stretch whole sections of your beat.

sound library

every time you sample something, it is stored inside the sound library.

samples are stored in the next available slot and automatically assigned in order.

pro-tip! if you want to sample your favorite acid synth, you can explicitly choose a destination for it by holding sound, typing a number on the pads (like 3..0..3..), pressing (enter), then hit sample!

### 10.2 sample tool

sample tool

to transfer audio files to use as samples to/from a computer, use the ep sample tool.

sample tool

connect K.O.II via usb-c and go to:

teenage.engineering/apps/ep-sample-tool
here are instructions on how to use the sample tool

pro-tip! K.O. II now supports samples with lower than native sample-rate. when transferring samples through the ep sample tool the audio file sample-rate will be preserved if lower than 46875. good for saving space on your KOII and getting a lo-fi sound! this means you can fit approx 100 minutes of 11.025 kHz/16-bit mono into 128 MB!

### 10.3 chop

chop

a great technique when making beats is to experiment with chopping up a drum rhythm or a chord-progression into smaller pieces. play them back in random order using the pads until you find something that has a groove to it.

chop it up

if you want to chop your sample up across different pads, you can choose between AUTO-CHOP, which lets K.O II do it for you, or LIVE CHOP to do it manually.

(SHIFT) + (SAMPLE) = (CHOP)

auto-chop

intelligently divide your sample into individual slices, they will be assigned to as many pads as the sample needs.

press (GROUPA)-(GROUPD) to select the group you wish to AUTO-CHOP. this will reset any pad assignments so make sure you pick an empty group or one you are happy to write over.

the sample chop point is auto detected using beat tracking, populating from bottom left to top right. use (minus)/(plus) to decide on the number of slices.

chop it up

if you want to chop your sample up across different pads, you can choose between AUTO-CHOP, which lets K.O II do it for you, or LIVE CHOP to do it manually.

(SHIFT) + (SAMPLE) = (CHOP)

auto-chop

intelligently divide your sample into individual slices, they will be assigned to as many pads as the sample needs.

press (GROUPA)-(GROUPD) to select the group you wish to AUTO-CHOP. this will reset any pad assignments so make sure you pick an empty group or one you are happy to write over.

the sample chop point is auto detected using beat tracking, populating from bottom left to top right. use (minus)/(plus) to decide on the number of slices.

hold the same group pad to switch between equal length and attack mode auto chop with (minus) and (plus).

equal length auto chop

equal length auto chop will slice the audio into perfect, even slices.

this is perfect for loops that have exact timing, where you want to trigger perfect time divisions.

attack mode chop

attack mode auto chop will slice the loudest parts of the sample.

use attack mode for percussive samples where you want to trigger individual sounds or slice from the most significant sections.

live chop

If you know where you want to slice, try LIVE CHOP. by using this hands-on approach, you have direct control over the placement of your sample's cuts.

when in CHOP mode, press a pad to CHOP. the break will be assigned depending on the amount of time between pressing pads. keep pressing pads as the sample plays to chop it up across your pads.

in and outputs

if it's not sounding quite right you can refine the exact in and out points of each chop by selecting the pad and turning (knobX) and (knobY) to set the precise start and end points.

pro-tip! holding down (SHIFT) while turning the (knobX) and (knobY) knobs will allow for finer control so you can find the perfect start and end points.

10.4

timing

sense of rhythm or not, quantization to the rescue! TIMING allows you to manually select the note interval of the step sequencer, as well as enable or disable quantized recording.

sound note interval illustration

1 = 1 step per bar
2 = 2 steps per bar

4 = 4 steps per bar
8 = 8 steps per bar

16 = 16 steps per bar
32 = 32 steps per bar

the 8T and 16T are triplet variations. 

8T = 12 steps per bar 
16T = 24 steps per bar

timing

to change the note interval press (timing).

set note interval

the (knobX) knob controls the note interval.

set swing

the (knobY) knob controls swing. 

(only applies to
1/8 and 1/16 note intervals).

quantize/free time

(minus) and (plus) toggle between quantize (minus) and free time (plus). 

quantised recording will always snap whatever you record to the chosen note interval.

free time will keep things loose and record exactly as you played it.

#### 10.4.1 note repeat

note repeat

it should be easy to record a hi-hat! if you hold down the TIMING while pressing a pad, your sample will play back according to the chosen note interval.

note repeat

hold (timing) and press a pad to trigger note repeat for that pad.

pro-tip! this is pressure sensitive when velocity is enabled!

held note repeat

press (timing), then hold (shift) and press a pad to hold the note repeat on that pad.

pro tip! note repeat 1 can be used to play back a sampled loop.

to disengage the held note repeat, just follow the same combination with the same pad.

arpeggio

when a oneshot or legato type sound is played while using note repeat, it will be arpeggiated in the order the notes are pressed.

to do so, you will need to press (keys) to engage keys mode and then hold (timing) and multiple pads.

#### 10.4.2 timing correct

timing correct

maybe everything was perfect except for one hit, but you don’t want to quantize everything because you love the beat?

use the (TIMING) (CORRECT) function to quantize individual pads or even individual notes. this way, things will fall into place without ruining any magic.

timing correct

open timing correct by pressing (SHIFT) and (TIMING).

quantize pad

when stopped, press a pad to quantize all the steps recorded to that pad.

live quantize

while playing, hold a pad during playback to quantize the notes played while held (the number of corrected notes will show on the display).

offset all notes

to nudge all notes on a pad by holding the pad and pressing (minus) or (plus) to move all notes recorded to it back or forward.

set note interval

turn (knobx) to adjust the note interval you wish to correct your notes to.

set swing

when the note interval is set to 8 or 16, turn (KNOBY) to adjust the swing.

### 10.5 loop

loop

loops create a repetitive pattern that can be incredibly catchy, memorable or annoying. 

think of them as a foundation to layer additional instruments and sounds.

they can also be tweaked and varied over time, and give a defining character to your song. 

the LOOP function is inspired by our beloved OB–4 magic radio.

enter loop

press (SHIFT) and (TEMPO) to create a loop. 

pro-tip: hold (SHIFT) and (TEMPO) to set the length of the loop. the loop starts when you hold both buttons and ends when you release them.

slide loop

use the (KNOBX) knob to slide the loop position back and forth. sliding is tempo locked. 

the display will show the position of the loop.

set loop length

when in loop mode use the (KNOBY) knob to set your loop length.

exit loop

press (TEMPO) to exit the loop directly or press (main) to exit the loop on the next bar.

loop

# effects

((11))

effects

finally, the fun starts. let’s give your track some personality! 

the (FX) button is where you'll find delay, reverb, distortion, chorus, filter, and compressor.

each group can send to one master fx and the sum of the mix is sent through a master compressor.

additionally, the live input from the line in can send to the chosen fx.

enter fx

press (FX) while playing.

choose fx

use (minus) and (plus) to navigate through the fx.

fx level

to adjust your FX use the fader.

move the FADER to adjust the amount of fx on the current group.

solo

while playing, hold (FX) and press a group pad to solo that group.
pro tip! hold (FX) and multiple group pads to solo multiple groups at once.

### 11.1 delay

delay

delay is like echo. it repeats the original sound multiple times to make it sound like you are somewhere like a valley or a fish bowl!

length

turn the (knobx) knob to adjust the length of your delay. this will change the time between repetitions.

feedback

to adjust your FX use the fader. turn the (knobY) knob to adjust the feedback of your delay. this will change how many times it repeats.

diagram

### 11.2 reverb

reverb

reverb can make it sound like you are in a massive church or a tiny room. turn it up and hear your sounds wash away like waves in the ocean!

length

turn the (knobX) knob to adjust the length of your reverb. this changes the size of the room.

color

turn the (knobY) knob to adjust the color of your reverb. this will filter out the high or low frequencies to make the reverb ‘darker’ or ‘brighter’.

reverb length

reverb emulates the sound of a space, from a small room to a cathedral.

### 11.3 distortion

distortion

rock out with distortion, beat up your beat and punch it down!press (FX) while playing.

drive

turn the (knobX) knob to adjust the drive of your distortion, overdriving your sounds more or less.

color

turn the (knobY) knob to adjust the color of your distortion, this will filter out and resonate the high or low frequencies making the distortion even crazier.

distortion

distortion clips the loudest parts of a waveform creating a warm, fuzzy sound.

### 11.3 chorus

11.4

chorus

spread things out and get wavy with chorus. turn this up to thicken up your chords and get freaky with your drums!

modulation

turn the (knobX) knob to adjust the modulation of your chorus. this is the rate at which it will move the sound around.

feedback

turn the (knobY) knob to adjust the feedback of your chorus. this will control how prominent the effect is by feeding the signal back into itself. turn it up and hear it ring!

chorus

chorus multiplies your audio and makes it sound richer.

### 11.5 filter

filter

looking for a more mellow sound? try the filter! filters are a great way of removing high or low frequencies and changing the character of a sound.

cutoff

turn the (knobX) knob to adjust the cutoff. this will set the range of frequencies to be cut. turn left to cut the highs and right to cut the lows.

resonance

turn the (knobY) knob to adjust the resonance. this emphasises the filter and can create an awesome sweeping sound. try turning it up and then moving the cutoff using the (knobX) knob!

filter

the filter allows you to shape your sound, by cutting and boosting certain frequencies.

### 11.6 compressor

compressor

punch down drums and keep your dynamics in check with the compressor!

drive

turn the (knobX) knob to adjust the drive. this controls how loud the audio going into the compressor is.

speed

turn the (knobY) knob to adjust the speed. this changes how fast the compressor is able to squash your sounds. turn up the drive and speed to hear your sounds get punched in the face by the compressor.

compressor

the compressor pushes down any loud portions of incoming audio while bringing up the overall volume, allowing you to reduce dynamics and add more punch!

### 11.7 punch in fx

PUNCH-IN FX 2.0™

holding down FX turns the pads into punch-in fx. punch-in fx are a super fast way of creating variations on your beat, each one adds a unique character and allows you to quickly perform with what you have created.

punch-in fx

hold (FX) and press the pads to trigger punch-in FX.

pressure sensitive

punch-in FX are pressure sensitive and can be combined.

### 11.8 live input fx

live input fx

plug something into the input jack and turn up the internal fx level to process it through the built in fx!

main

press (main) to enter the main mode.

input gain

turn the (KNOBX) knob to adjust the input volume.

send level

turn the (KNOBY) knob to adjust the internal fx send level.

### 11.9 output

output

tighten up your sound with the master compressor. adjust drive for a more pronounced compression effect and speed to decide how quickly the compressor should respond to the input signal.

output settings

press (SHIFT) and (FX) to enter the output settings (master compressor).

drive

turn the (KNOBX) knob to adjust the drive.

speed

turn the (KNOBY) knob to adjust the speed - try cranking this and hear what it does to your beat.

11.9.1

sidechain

sometimes things don’t quite sit right and you need to put certain sounds in their place. other times you want to kick the bass in the face with the kick. that’s where sidechain comes in!

sidechaining on ko2 uses note triggers to engage the sidechain compressor, this means you can trigger the sidechain compressor even without sound and choose the exact length and shape.

sidechain

to open the sidechain settings press (SHIFT) and (FX) to enter the output settings (master compressor) then (plus).

select source

hold a group pad and select a sound to add it as a source for the sidechain.

select group

hold (shift) and press a group pad to add it as a destination for the sidechain.

length

turn the (KNOBX) knob to adjust length of the duck.

shape

turn the (KNOBY) knob to adjust the shape of the duck.

sidechain

# how to

((12))

how to

### 12.1 enable velocity sensitivity

enable velocity sensitivity

((1)) open system settings

press (shift) and (erase) to enter the system settings.

((2)) navigate to pad settings

use (minus) and (plus) to navigate to the pad settings, then press (enter) on the pads.

((3)) navigate to velocity settings

use (minus) and (plus) to navigate to ‘vel’, then hit (enter).

((4)) select velocity mode

use (minus) and (plus) to choose between:

off (no velocity sensitivity).
hi (for when playing with less force). 
low (for when playing with more force).

then hit (enter) to choose your velocity setting!

((5)) return to main

press (main) to return to main and exit the system settings.

((6)) hit the pads!

hit the pads to hear the velocity sensitivity!

### 12.2 change the scale in keys mode

change the scale in keys mode

((1)) main

first, make sure that you are in the main mode.

press (main) to enter the main mode from any page in the device.

((2)) choose a sample

choose a pad that you wish to play across a scale.

((3)) enter keys mode

press (keys) to enter keys mode.

the pads will become a keyboard that have the chosen sample transposed across a scale.

((4)) change octave

hold (keys) and press (minus) or (plus) to change the octave.

((5)) transpose

hold (keys) and press a pad to transpose the scale.

((6)) change key

hold (keys) and rotate the (knobx) knob to change the key.

((7)) change scale

hold (keys) and rotate the (knoby) knob to change the scale.

((8)) play the pads

play the pads to hear the chosen key and scale!

12.3

turn on the metronome while playing

((1)) open system settings

press (shift) and (erase) to enter the system settings.

((2)) navigate to sequencer settings

use (minus) and (plus) to navigate to the sequencer settings, then press (enter) on the pads.

((3)) navigate to metronome settings

use (minus) and (plus) to navigate to ‘met’, then hit (enter).

((4)) select metronome mode

use (minus) and (plus) to choose between:

on - ENABLE METRONOME AT RECORD+PLAY
rec - ENABLE METRONOME AT RECORD ONLY (DEFAULT)
cnt - ENABLE METRONOME AT COUNT-IN ONLY

then hit (enter) to choose your metronome setting!

((5)) return to main

press (main) to return to main and exit the system settings.

((6)) tempo

press (tempo) to open the tempo mode.

((7)) turn up metronome volume

turn the (knobY) to turn up the metronome.

((8)) press play

press (play) to hear the metronome!

12.4

sync two K.O.II units

((1)) get started

for this setup you will need two K.O.II devices and a 3.5 mm to 3.5 mm cable.

((2)) connect via sync

firstly, make sure that both K.O.II devices are set to 1/16 sync both in and out.

you can then plug the cable into the sync out on one K.O.II and the sync in on the other.

12.5

sync a pocket operator to K.O.II

((1)) connect K.O.II to the pocket operator

first plug one end of a 3.5 mm cable into the sync output on your K.O.II, then the other end into the input jack on the left side of your pocket operator.

((2)) set your pocket operator to sync 2

press the function button under the rightmost knob and the bpm button until the screen shows SY2.

this will listen for a sync pulse on the input jack and output stereo audio from the output jack.

((3)) enter system settings

enter system settings by pressing (shift) and (erase).

((4)) navigate to sync

use (minus) and (plus) to navigate to the sync settings, then press (enter) on the pads.

((5)) navigate to sync > out

use (minus) and (plus) to navigate to ‘OUT’, then hit (enter).

((6)) navigate to sync > out > 8

use (minus) and (plus) to navigate to ‘8’, then hit (enter).

((7)) sync 8

K.O.II will now send a 1/8 clock pulse on it’s sync-out jack, meaning that it can sync with any device that receives 1/8 clock.

((8)) press play

press play on your pocket operator then (play) on your K.O.II and the two will sync to the same BPM!

12.6

sync K.O.II to a pocket operator

((1)) connect your pocket operator to K.O.II

for this setup you will need a 3.5 mm stereo (trs) to 2 x 3.5 mm mono (ts) cable.

connect the stereo end to the output of the pocket operator then plug the right channel (ring - red on our cables) into the input jack on your K.O.II and the left channel (tip - brown or white on our cables) into the sync input jack on your K.O.II.

((2)) set your pocket operator to sync 1

press the function button under the rightmost knob and the bpm button until the screen shows SY1.

this will send a sync pulse on the left channel (tip) of the output jack.

((3)) enter system settings

enter system settings by pressing (shift) and (erase).

((4)) navigate to sync

use (minus) and (plus) to navigate to the sync settings, then press (enter) on the pads.

((5)) navigate to sync > in

use (minus) and (plus) to navigate to ‘in’, then hit (enter).

((6)) navigate to sync > in > 8

use (minus) and (plus) to navigate to ‘8’, then hit (enter).

((7)) sync 8

K.O.II will now listen for a 1/8 clock pulse on it’s sync-in jack, meaning that it can sync with any device that sends 1/8 clock.

((8)) press play

press play on your pocket operator then (play) on your K.O.II and the two will sync to the same BPM!

pro-tip! with this setup you can add the K.O.II’s internal effects to the audio coming from the pocket operator!

### 12.7 sync koii to a vintage drum machine

connect your K.O.II to the drum machine

((1)) connect your K.O.II to the drum machine

first plug one end of a 3.5 mm cable into the sync out on your vintage drum machine, then the other end into the sync input on your K.O.II.

some vintage drum machines use a standard called DIN-sync that requires an adaptor or special cable.

((2)) enter system settings

enter system settings by pressing (shift) and (erase).

((3)) navigate to sync

use (minus) and (plus) to navigate to the sync settings, then press (enter) on the pads.

((4)) navigate to sync > in

use (minus) and (plus) to navigate to ‘in’, then hit (enter).

((5)) navigate to sync > in > 24

use (minus) and (plus) to navigate to ‘24’, then hit (enter)

((6)) sync 24

K.O.II will now listen for a sync24 clock pulse on it’s sync-in jack, meaning that it can sync with any device that sends sync24 clock.

((7)) press play!

press play on your drum machine and K.O.II (play) at the same time and sync to the same BPM!

((8)) sync out to the drum machine

follow the same steps as before but instead connect the K.O.II’s sync out to the sync-in of your drum machine then navigate to sync > out > 24.

### 12.8 control koii with a midi keyboard

control K.O.II with a midi keyboard

((1)) get started!

for this setup, depending on your midi keyboard you may need a 3.5 mm stereo (trs) to midi din cable. some midi keyboards have trs midi and thus a 3.5 mm trs cable can be used between the keyboard and the K.O.II.

for usb midi keyboards you will need a midi host (this is typically a computer connected over usb-c or a dedicated midi host box) between the K.O. II and the MIDI keyboard.

((2)) connect your midi keyboard

once you have your midi keyboard connected, K.O.II will detect any notes and light up the MIDI or usb icon (depending on what input is used) on the screen.

((3)) play the pads with the keyboard!

now, any notes you play on the keyboard will trigger the pads on K.O.II!

((4)) play one pad across the keyboard!

if you want to play one pad transposed across the keyboard then just press (keys)!

12.9

sequence external midi with K.O.II

((1)) get started!

for this setup, depending on your midi device you may need a 3.5 mm stereo (trs) to midi din cable.

some midi devices have trs midi and thus a 3.5 mm trs cable can be used. alternatively for usb midi devices a usb-c cable can be used.

((2)) connect your midi device

once you have your midi device connected, K.O.II will be able to send midi notes to it.

((3)) set a pad as a midi channel

press (shift) and (sound) to enter sound edit mode.

((4)) set a pad as a midi channel

select a pad, then navigate to the pad’s midi settings using (minus) and (plus).

pro-tip! setting the value of a pad when holding (sound) to “000” will create an empty pad that can hold midi without stealing any voices.

((5)) change midi channel

use the (knobx) knob to change the midi channel that the pad will send to.

((6)) change midi root note

use the (knoby) knob to change the root note of the midi notes, this allows you to sync your midi to the root note of your sample.

((7)) done!

now, any notes you play or sequence on that pad will send midi to the chosen channel!

((8)) bonus: send or receive midi clock

to send or receive clock to or from the connected devices go to system settings by pressing (shift) and (erase) then navigate to MIDI > Clock and choose from off, on or out.

12.10

resample a chord

((1)) select a sound to sample

press (sound) then press a pad and select a sound from the sound library.

((2)) enable KEYS mode

press (main) to return to the main screen. select the pad and then press (keys) to activate keys mode.

((3)) press SAMPLE

press (sample) to enter the sampler.

((4)) select resampling

press (plus) to select resampling as the sound source for sampling.

((5)) select a group

press a group pad to choose which group to sample to.

((6)) start hands free sampling

press (shift) and a pad to start hands free sampling on that pad.

((7)) reopen the group with the sample

go back to the group with the sample you wish to resample.

((8)) play the chord

play the chord you wish to record on the pads.

((9)) stop recording

press (sample) to stop the recording.

((10)) done!

you will now have a chord that has been resampled to another group’s pad!

12.11

record a sample using usb audio

((1)) connect your ko2 to a computer

connect your ko2 to any class compliant usb audio host such as a computer or smartphone using a usb-c cable.

((2)) select ko2 as the audio device

on the connected device select ko2 as the audio output device. this will allow audio to pass directly to your ko2.

((3)) press SAMPLE

press (sample) to enter the sampler.

((4)) select usb as the source

press (plus) to select usb as the sound source for sampling.

((5)) start sampling

press a pad to sample the sound coming from your computer.

((6)) done!

now you can play back your sample and use it in your beats!

# system

((14))

system

SYSTEM lets you configure stuff like 
pad-velocity or how your midi and sync ports behave. for quick access, you can learn the numbers, like typing 301 and ENTER to turn velocity on. now you’re in expert mode!

SYSTEM SETTINGS

to customize the behavior of your K.O.II press (SHIFT) and (ERASE) to access system settings.

navigate

press (minus) or (plus) to navigate through the settings, and then ENTER to select.

enter

to navigate back to the previous page you can press (SHIFT) and ENTER.

alternatively you can also use the following codes to directly access the setting once in system settings.

code

path

setting

100

mid

clk

off

MIDI Clock Off (default)

101

mid

clk

in

MIDI Clock in (receive only)

102

mid

clk

out

MIDI Clock Out (send only)

110

mid

chn

all

Receive all channels, send on MIDI channel 1.

111

mid

chn

ch.1

Receive and send on MIDI Channel 1

112

mid

chn

ch.2

Receive and send on MIDI Channel 2

113

mid

chn

ch.3

Receive and send on MIDI Channel 3

114

mid

chn

ch.4

Receive and send on MIDI Channel 4

115

mid

chn

ch.5

Receive and send on MIDI Channel 5

116

mid

chn

ch.6

Receive and send on MIDI Channel 6

117

mid

chn

ch.7

Receive and send on MIDI Channel 7

118

mid

chn

ch.8

Receive and send on MIDI Channel 8

119

mid

chn

ch.9

Receive and send on MIDI Channel 9

120

mid

chn

ch10

Receive and send on MIDI Channel 10

121

mid

chn

ch.11

Receive and send on MIDI Channel 11

122

mid

chn

ch.12

Receive and send on MIDI Channel 12

123

mid

chn

ch.13

Receive and send on MIDI Channel 13

124

mid

chn

ch.14

Receive and send on MIDI Channel 14

125

mid

chn

ch.15

Receive and send on MIDI Channel 15

126

mid

chn

ch.16

Receive and send on MIDI Channel 16

127

mid

chn

off

only send midi if midi channel assigned in sound edit

130

mid

thr

off

disable MIDI thru

131

mid

thr

on

enable midi thru (Forwards MIDI signals, in→ out)

140

mid

rst

off

do not reset midi controllers at stop (default)

141

mid

rst

on

reset midi controllers at stop

200

syn

in

8

Sync In Rate 1/8th Note

201

syn

in

16

Sync In Rate 1/16th Note (default)

202

syn

in

24

SYNC IN RATE 24 PULSES PER QUARTER NOTE

210

syn

out

8

SYNC OUT RATE 1/8TH NOTE

211

syn

out

16

Sync Out Rate 1/16th Note (default)

212

syn

out

24

Sync Out Rate 24 Pulses per Quarter Note

300

pad

vel

off

PAD VELOCITY OFF (DEFAULT)

301

pad

vel

hi

PAD VELOCITY HIGH. PLAY WITH A SOFT TOUCH

302

pad

vel

lo

PAD VELOCITY LOW. FOR VIGOROUS PLAY STYLES

310

pad

aud

on

sample audition on

311

pad

aud

off

sample audition off

320

pad

led

lo

led brightness - low

321

pad

led

mid

led brightness - mid

322

pad

led

high

led brightness - high

330

pad

pot

sca

Knob/fader takeover mode — scaling (default)

331

pad

pot

cat

Knob/fader takeover mode — catch

400

seq

met

on

Enable metronome at record+play

401

seq

met

rec

Enable metronome at record only (default)

402

seq

met

cnt

enable metronome at count-in only

410

seq

scn

tic

Change scene immediately (default)

411

seq

scn

bar

Sync scene changes with bar end

412

seq

scn

ptn

Sync scene changes with pattern end

420

seq

lop

off

song loop off

421

seq

lop

on

song loop on

430

seq

ply

bar

play from current bar

431

seq

ply

ptn

play from pattern start

500

smp

rec

lo

low sample recording rate - 26,250khz

501

smp

rec

mid

mid sample recording rate - 32,000khz

502

smp

rec

high

high sample recording rate - 46,875khz (default)

510

smp

usb

rec

usb audio input mode - sampler only (default)

511

smp

usb

mon

usb audio input mode - sampler + live monitoring

14.1

midi implementation chart

function

transmitted

recognised

notes

basic channel

mode

velocity

aftertouch

pitch bend

control
change

program change

system exclusive

system
common

system
realtime

aux messages

default

changed

default

messages

altered

true voice

note on

note off

keys

channels

CC#0,32

CC#1

song position

song select

tune request

clock

commands

all sound off

reset all controllers

local on/off

all notes off

active sensing

system reset

1

1–16

mode 1

x

-

36-47 (group a)

48-59 (group b)

60-71 (group c)

72-83 (group d)

keys mode: 0-127

-

x

(0-127)

x

1

1–16

mode 1

x

-

36-47 (group a)

48-59 (group b)

60-71 (group c)

72-83 (group d)

keys mode: 0-127

-

x

(0-127)

x

memorized

bank select

mod wheel

use bank select to reach all sounds 1-999

identity request+reply, proprietary messages

Mode 1: OMNI ON, POLY
Mode 2: OMNI ON, MONO
Mode 3: OMNI OFF, POLY
Mode 4: OMNI OFF, MONO

14.2

midi note map

when using an external midi device such as a keyboard or drum pad, you can use the table below as a midi note reference for triggering specific pads on each group. if you are in keys mode, this will change to a chromatic keyboard.

make sure that you are addressing the correct midi channel, this can be set in sound edit’s midi page as well as the system settings.

MIDI note number

note name

group

pad

36

c2

a

.

37

c#2

a

0

38

d2

a

enter

39

d#2

a

1

40

e2

a

2

41

f2

a

3

42

f#2

a

4

43

g2

a

5

44

g#2

a

6

45

a2

a

7

46

a#2

a

8

47

b2

a

9

48

c3

b

.

49

c#3

b

0

50

d3

b

enter

51

d#3

b

1

52

e3

b

2

53

f3

b

3

54

f#3

b

4

55

g3

b

5

56

g#3

b

6

57

a3

b

7

58

a#3

b

8

59

b3

b

9

60

c4

c

.

61

c#4

c

0

62

d4

c

enter

63

d#4

c

1

64

e4

c

2

65

f4

c

3

66

f#4

c

4

67

g4

c

5

68

g#4

c

6

69

a4

c

7

70

a#4

c

8

71

b4

c

9

72

c5

d

.

73

c#5

d

0

74

d5

d

enter

75

d#5

d

1

76

e5

d

2

77

f5

d

3

78

f#5

d

4

79

g5

d

5

80

g#5

d

6

81

a5

d

7

82

a#5

d

8

83

b5

d

9

14.3

lock mode

to prevent any changes to projects, patterns, scenes, pads and settings you can use lock mode.

hold (main) on start up to lock the device.

lock mode

lok will display on the screen for about 1 second.

any changes made on the device will reset when the device is restarted.

14.4

error codes

error code

meaning

solution

E.01

sram error

your unit needs to be repaired

E.02

flash error

your unit needs to be repaired

E.03

codec error

your unit needs to be repaired

E.10

LFS INVALID

file-system error, flash needs to be formatted

E.11

LFS CORRUPT

file-system error, flash needs to be formatted

E.12

OTHER LFS ERROR

file-system error, flash needs to be formatted

E.05

sample_fs error

file-system error, flash needs to be formatted

if your segment display shows a file-system error code it means the file-system needs to be formatted.

to do this, power the device off, then hold (shift) + (erase) and turn it on.

this will format the drive erasing all sounds and help your device to boot up again by removing any files that were causing issues. 

make sure to update the OS to our latest release as we are constantly fixing bugs that may cause such issues.

14.5

midi cc map

some parameters on ko2 can be controlled with an external controller. to do so you must use a midi control change, also known as a “midi cc”.

below is a list of all the parameters that can be adjusted with midi control changes.

MIDI cc number

range

function

1

1-127

vibrato

12

1-127

fx parameter (knobx)

13

1-127

fx parameter (knoby)

64

1-127

sustain pedal for key and legato voices

# buttons and combos

4.

buttons and combos

### 4.1 groups

4.1 groups

buttons (GROUPA) - (GROUPD) select between 4 groups each containing 99 patterns and 12 sounds.

### 4.2 pads

4.2 pads

the 12 pads can be populated with sounds, and also functions as a number pad.

### 4.3 minus and plus

4.3 - and +

(minus) and (plus) are central controls of K.O.II allowing you to switch between scenes and patterns, adjust pattern length, navigate to the next or previous step, move to the next bar, browse effects, nudge notes, adjust tempo, choose sounds and more.

### 4.4 shift

4.4 shift

(SHIFT) is the gateway to other functions or menus.

for example, if you press the SOUND button, you enter SOUND mode, but if you press (SHIFT) + (SOUND) you enter SOUND EDIT mode! (SHIFT) works with almost every button on K.O.II.

### 4.5 fader

4.5 fader

the fader on K.O.II is a great way to quickly adjust various parameters in a given group. 

by default the fader will control group volume (level).

to select the function of the fader, hold down (FADER) and choose from the options above the pads.

### 4.6 x and y

4.6 x and y knobs

(KNOBX) and (KNOBY) allow you to control the various parameters within K.O.II ranging from FX levels through to tempo, swing and compressor speed.

pro-tip! holding (SHIFT) while turning (KNOBX) or (KNOBY) makes them react slower allowing you to make precise adjustments!

### 4.7 timing

timing

K.O.II supports 1/1, 1/2, 1/4, 1/8, 1/8T, 1/16, 1/16T and 1/32 timing modes, each timing mode changes the note interval of the step sequencer.

the ‘T’ in the timing modes describes a triplet note interval.

1/1

1/2

1/4

1/8

1/8T

1/16

1/16T

1/32

### 4.8 sample

sample

K.O.II has 999 sample slots and a total of 128 MB built-in memory.

you can record sounds using the internal microphone, or use the stereo line-in to capture your favorite synth and sample.

samples can also be transferred to and from a computer via USB with our sample tool.

# erase drive

((15))

erase drive

warning! this will remove all your work as well as all factory sounds. once removed factory sounds can not be recovered!

erase drive

if you want to start fresh and remove all samples and patterns from your device

hold (SHIFT) + (ERASE) on start up to format the device.

erase drive

FMT will display on the screen for about 10 seconds

then it will start up as usual with all content removed.

# tech specs

((16))

technical specifications

Stereo Line input
24 bit
SNR: 96 dBA
impedance: 6.5 kOhm
analog gain: 0 - 12 dB
max level: 8 dBu, 2.0 Vrms

Stereo Headphone/Line Output:
24 bit
SNR: 98 dBA
max level: 5 dBu, 1.4 Vrms

MIDI input
MMA compliant pinout (type A)
opto-coupled

MIDI output
MMA compliant pinout (type A)
voltage: 3.3 V

Sync output
TIP: Sync 8th, 16th, 24 ppqn
RING: Start/Stop
voltage: 3.3 V

Sync input
TIP: Sync 8th, 16th, 24 ppqn
RING: Start/Stop
voltage: 3.3 V
max level: 10 V

internal clock/sequencer resolution/step resolution
96 ticks (ppqn)

# warnings warranty fcc

18.

warnings and warranty

warnings. warranty and fcc.

teenage engineering ep-133
model no: TE032AS001

fcc regulatory compliance

this device complies with part 15 of the fcc rules. operation is subject to the following two conditions:

(1) this device may not cause harmful interference, and (2) this device must accept any interference received, including interference that may cause undesired operation.

warning: changes or modifications not expressly approved by the party responsible for compliance could void the user's authority to operate the equipment.

note: this equipment has been tested and found to comply with the limits for a class b digital device, pursuant to part 15 of the fcc rules. these limits are designed to provide reasonable protection against harmful interference in a residential installation. this equipment generates, uses and can radiate radio frequency energy and, if not installed and used in accordance with the instructions, may cause harmful interference to radio communications. however, there is no guarantee that interference will not occur in a particular installation. if this equipment does cause harmful interference to radio or television reception, which can be determined by turning the equipment off and on, the user is encouraged to try to correct the interference by one or more of the following measures:

reorient or relocate the receiving antenna.increase the separation between the equipment and receiver.connect the equipment into an outlet on a circuit different from that to which the receiver is connected.consult the dealer or an experienced radio/TV technician for help.

ices statement

ices-3 (B) / nmb-3 (b)

warranty and return policy

warranty, returns policy and terms and conditions can be found here

recycling

electrical and electronic equipment, parts and batteries marked with this crossed-out wheelie bin symbol must not be disposed of with normal household wastage, it must be collected and disposed of separately to protect the environment.

# software licenses

software licenses

littlefs

Copyright (c) 2022, The littlefs authors.
Copyright (c) 2017, Arm Limited. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution. Neither the name of ARM nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission. 
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF zTHE POSSIBILITY OF SUCH DAMAGE.

tinycrypt

====================================

 TinyCrypt Cryptographic Library 

====================================

Copyright (c) 2017, Intel Corporation.
All rights reserved. 

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

Redistributions in binary form must reproduce the above copyright notice, zthis list of conditions and the following disclaimer in the documentation 
and/or other materials provided with the distribution.  
Neither the name of the Intel Corporation nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission. 

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND 
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED 
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR 
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES 
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; 
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON 
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT 
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS 
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

===================================

Copyright (c) 2014, Kenneth MacKay
All rights reserved.

https://github.com/kmackay/micro-ecc
Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

====================================

MCUboot  

https://github.com/mcu-tools/mcuboot
  Copyright (c) {YYYY} [NAME OF COPYRIGHT OWNER]  

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at  

http://www.apache.org/licenses/LICENSE-2.0  
Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

# credits

((17))

credits

beta tester

256k
alvaro villalobos
bweeb
cuckoo
DEFENSE MECHANISM
dimi3
djcuvcuv
dom adverb
Emerging Patterns
flah
javs
lkngrrr
lane
matt donald
matthew williams
michael hellqvist
nick hook
noiserock
samplik prost
sean hellfritsch
tt beats
WeS
yellow eyes

content

teddy stuart
jerker eklund
valter kinbom
isak hedtjarn
tengan
ben minto
bil bryant
nosaj thing
the kount
byron the aquarius
akebono unlimited
manmade mastering
