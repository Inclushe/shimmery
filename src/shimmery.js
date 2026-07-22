// import { ShimmeryDebug } from "./debug.js";

class ShimmeryClass {
	enableBtn = document.getElementById("enable");
	desktopMsg = document.getElementById("desktopMsg");
	smoothCheck = document.getElementById("smoothCheck");
	accelCheck = document.getElementById("accelCheck");
	ajerkCheck = document.getElementById("ajerkCheck");
	decelCheck = document.getElementById("decelCheck");
	angAccelCheck = document.getElementById("angAccelCheck");
	dropLimCheck = document.getElementById("dropLimCheck");
	leadCompCheck = document.getElementById("leadCompCheck");
	// Smoothing: when off, snap to the target instead of easing toward it.
	// Orientation mode (see the segmented toggle below): "Predicted" extrapolates
	// the reading forward; "Raw Sensor" uses the reading as-is for an A/B
	// comparison and disables/forces-off every prediction-related option.
	// NOTE on the limiters: "Linear accel"/"AbsJerk" all key off LINEAR
	// (translational) motion from the DeviceMotion accelerometer; "Angular decel"
	// keys off ROTATIONAL motion from DeviceOrientation. Same word "accel" but two
	// unrelated quantities/sensors.
	// Linear accel limiter: when on, damp the prediction while linear acceleration is
	// high (e.g. shoving the phone) so jitter isn't amplified into flicker.
	// AbsJerk limiter: keyed off the rectify-then-smooth linear-jerk envelope (stays
	// elevated across a sign change). On by default.
	// Damp glide (per limiter): ease each limiter's damping toward its target in both
	// directions (over its own attack/release times) instead of snapping, so a
	// limiter engaging abruptly doesn't slam `damp` and cause its own flicker.
	_smoothing = true;
	_prediction = true;
	_accelLimiter = true;
	_absJerkLimiter = true;
	_decelLimiter = false; // idea 1: damp prediction during abrupt deceleration
	_angAccelLimiter = false; // damp prediction during abrupt rotation onset (off: it opposes snappy onset)
	_dropLimiter = true; // ramp the co-moving gate's drop with peak speed (off: static drop field)
	_inertia = false; // settle active (false only for the "Velocity" algorithm); derived from settleMode
	_settleMode = "velocity"; // which inertial settle algorithm: "velocity" | "spring" | "comoving"
	_leadComp = true; // pre-pay the spring's c/k group delay by extending the lead (borrowed from main)
	// Per-limiter glide enables (default on, except the drop limiter).
	_accGlide = true;
	_ajerkGlide = true;
	_decelGlide = true;
	_angAccGlide = true;
	_dropGlide = false;

	// Orientation prediction (see frame()): we extrapolate the orientation
	// vector forward by LEAD_MS to mask the sensor's latency.
	LEAD_MS = 90; // how far ahead to predict (ms)
	MAX_LEAD_ANGLE = 0.6; // clamp on predicted rotation (radians)
	VEL_SMOOTH = 0.35; // angular-velocity smoothing (0-1)
	VEL_DET_SMOOTH = 0.3; // EMA for the peak-detector velocity (1.0 = raw angSpeed)
	CUR_SMOOTH = 0.9; // light de-jitter easing toward the prediction
	STALE_MS = 120; // drop velocity if readings stop coming

	// Linear accel limiter: damp the prediction as LINEAR acceleration (m/s^2, from
	// the DeviceMotion accelerometer - NOT rotation) rises, so a fast translation
	// (shoving the phone) can't amplify sensor jitter into flicker. Distinct from
	// the Angular decel limiter below, which keys off rotational deceleration.
	ACC_LOW = 3; // below this (m/s^2) prediction is untouched
	ACC_HIGH = 4; // above this the prediction is fully damped
	ACC_SMOOTH = 0.4; // EMA factor for the accel magnitude

	// AbsJerk limiter: ramp keyed off the rectify-then-smooth envelope, which reads
	// higher and has a nonzero noise floor, so it gets its own (higher) band.
	ABSJERK_LOW = 15; // below this (m/s^3) prediction is untouched
	ABSJERK_HIGH = 30; // above this the prediction is fully damped
	ABSJERK_SMOOTH = 0.4; // EMA factor for the rectified-jerk envelope

	// Damp glide: ease the combined limiter damping toward its target with separate
	// time constants for engaging (toward more damping / 0) and releasing (toward 1).
	GLIDE_ATTACK_MS = 120; // glide toward more damping
	GLIDE_RELEASE_MS = 120; // glide back toward no damping

	// Angular decel limiter (idea 1): damp the prediction while ANGULAR speed (the
	// orientation's rotation rate, from DeviceOrientation - NOT the accelerometer)
	// is dropping fast, i.e. a rotation ending abruptly, so the lagging predAngle
	// can't overshoot. Different quantity/sensor than the Linear accel limiter above.
	DECEL_LOW = 20; // below this (rad/s^2) prediction is untouched
	DECEL_HIGH = 30; // above this the prediction is fully damped
	DECEL_SMOOTH = 0.2; // EMA factor for the angular-deceleration signal

	// Angular accel limiter: the speeding-up counterpart of the decel limiter. Damp the
	// prediction while ANGULAR acceleration (rotation rate ramping up at the onset
	// of a flick, from DeviceOrientation) is high, so a sharp start can't overshoot.
	ANGACC_LOW = 20; // below this (rad/s^2) prediction is untouched
	ANGACC_HIGH = 30; // above this the prediction is fully damped
	ANGACC_SMOOTH = 0.2; // EMA factor for the angular-acceleration signal

	// Inertial settle (velocity-coupled): while a movement is FAST, `cur` is PACED
	// by the motion's angular velocity (rotated by angSpeed*dt about angAxis) so it
	// tracks the rotation rate with no spring lag. On top of that an always-on
	// underdamped spring pulls `cur` toward the lead-predicted target -- carrying
	// its own velocity (curVel) so it overshoots/coasts to rest like main's old
	// inertial settle -- plus a weak anchor toward raw truth to kill drift. The
	// velocity peak-detector (FAST/SLOW) freezes the follow the instant a motion
	// winds down so `cur` settles instead of chasing the ringing reading.
	SPRING_STIFF = 2500; // 1/s^2; spring stiffness toward the led target (k)
	SPRING_ZETA = 0.7; // damping ratio; c = 2*sqrt(k)*zeta. < 1 overshoots (Snap = 0.7)
	ANCHOR_STIFF = 1; // 1/s^2; weak always-on spring toward raw truth (drift correction)
	COAST = 0.25; // 0..1; fraction of the motion's momentum kept entering SLOW (coast-through)
	BASE_TRACK = 0.05; // 0..1; per-frame rate the co-moving setpoint base bleeds toward raw truth
	LEAD_RATE = 1; // multiplier on how fast the lead grows in with motion (1 = at the motion's rate)
	// Spring inertial settle (from the main branch), kept selectable for A/B. A speed-gated strong
	// spring tracks the led target while moving; as measured speed -> 0 the drive
	// fades and `cur` coasts to rest under constant damping. Its own variables --
	// nothing is shared with the co-moving algorithm above.
	SPRING_SETTLE_SPEED = 1.0; // rad/s; at/above this the measured-speed drive is full
	SPRING_TRACK_STIFF = 2500; // 1/s^2; strong tracking spring (gated by measured speed)
	SPRING_ANCHOR_STIFF = 1; // 1/s^2; weak always-on spring toward raw truth
	SPRING_DAMP_STIFF = 70; // 1/s; constant velocity damping (= 2*sqrt(2500)*0.7, zeta 0.7)
	// Velocity peak-detector: FAST while the detector velocity climbs/holds at its
	// peak; SLOW once it falls below VEL_DROP of the peak (a movement winding down,
	// latched through to rest); re-arm FAST when it rises VEL_RISE above its valley
	// (a new movement). VEL_DROP is a fraction so it scales with rotation size;
	// VEL_RISE (rad/s) doubles as the rest-noise gate.
	VEL_DROP = 0.7; // SLOW when detVel < peak * VEL_DROP
	VEL_RISE = 0.3; // rad/s; FAST when detVel > valley + VEL_RISE

	// Drop limiter: instead of a fixed gate drop, ramp it up with the motion's PEAK
	// speed so slow motions stay springy (drop -> DROP_MIN, gate never flips, full
	// co-moving spring) while fast motions clamp at their tail (drop -> DROP_MAX,
	// gate flips early into the deceleration). LOW/HIGH are peak-velocity thresholds.
	DROP_LOW = 0.5; // rad/s; at/below this peak speed -> DROP_MIN (springy)
	DROP_HIGH = 1.0; // rad/s; at/above this peak speed -> DROP_MAX (clamps)
	DROP_MIN = 0; // gate drop fraction for slow motions
	DROP_MAX = 0.9; // gate drop fraction for fast motions

	// Live, debug-editable copies of each limiter's LOW/HIGH band. Default to the
	// constants above; the number inputs (visible only in debug mode) update
	// these, and frame() uses them in place of the constants when debug is on.
	accLowV = this.ACC_LOW;
	accHighV = this.ACC_HIGH;
	ajerkLowV = this.ABSJERK_LOW;
	ajerkHighV = this.ABSJERK_HIGH;
	decelLowV = this.DECEL_LOW;
	decelHighV = this.DECEL_HIGH;
	angAccLowV = this.ANGACC_LOW;
	angAccHighV = this.ANGACC_HIGH;
	dropLowV = this.DROP_LOW;
	dropHighV = this.DROP_HIGH; // drop limiter peak-velocity band
	dropMinV = this.DROP_MIN;
	dropMaxV = this.DROP_MAX; // drop limiter output range
	// Per-limiter (and dynamic-speed) glide attack/release times (ms) plus the
	// gliding state each one carries. Seeded from the shared GLIDE_* defaults.
	accAtkV = this.GLIDE_ATTACK_MS;
	accRelV = this.GLIDE_RELEASE_MS;
	ajerkAtkV = this.GLIDE_ATTACK_MS;
	ajerkRelV = this.GLIDE_RELEASE_MS;
	decelAtkV = this.GLIDE_ATTACK_MS;
	decelRelV = this.GLIDE_RELEASE_MS;
	angAccAtkV = this.GLIDE_ATTACK_MS;
	angAccRelV = this.GLIDE_RELEASE_MS;
	dropAtkV = this.GLIDE_ATTACK_MS;
	dropRelV = this.GLIDE_RELEASE_MS;
	accGl = { v: 1 };
	ajerkGl = { v: 1 };
	decelGl = { v: 1 };
	angAccGl = { v: 1 };
	dropGl = { v: this.VEL_DROP }; // glide state for the drop limiter
	dropEff = this.VEL_DROP; // current gate drop fraction (limiter output or static)
	curSmoothV = this.CUR_SMOOTH;
	leadTimeV = this.LEAD_MS / 1000; // seconds; predictive lead time (the `lead ms` field)
	anchorV = this.ANCHOR_STIFF; // 1/s^2; weak spring toward raw truth (the `anchor` field)
	springStiffV = this.SPRING_STIFF;
	springZetaV = this.SPRING_ZETA; // spring knobs (`stiff`/`zeta`)
	coastV = this.COAST; // momentum kept entering SLOW (the `coast` field)
	baseTrackV = this.BASE_TRACK;
	leadRateV = this.LEAD_RATE; // co-moving setpoint knobs (`basetrk`/`leadrt`)
	springSpeedV = this.SPRING_SETTLE_SPEED;
	springTrackV = this.SPRING_TRACK_STIFF;
	// spring algo knobs (`speed`/`track`/`anchor`/`damp`) -- independent vars
	springAnchorV = this.SPRING_ANCHOR_STIFF;
	springDampV = this.SPRING_DAMP_STIFF;
	velDropV = this.VEL_DROP;
	velRiseV = this.VEL_RISE;
	velSmoothV = this.VEL_DET_SMOOTH;
	accSmoothV = this.ACC_SMOOTH; // EMA factor for accel magnitude (debug-editable)
	ajerkSmoothV = this.ABSJERK_SMOOTH; // EMA factor for the rectified-jerk envelope
	decelSmoothV = this.DECEL_SMOOTH;
	angAccSmoothV = this.ANGACC_SMOOTH;
	debugOn = false;

	// Ease st.v toward target with separate attack/release time constants. For
	// limiters, "attack" = engaging more damping (value falling, attackLower=true);
	// for dynamic speed it's the value rising (attackLower=false). When off, snap
	// (keeps state in sync so toggling is seamless).
	glide(st, target, on, atkMs, relMs, dtMs, attackLower) {
		if (!on) {
			st.v = target;
			return target;
		}
		const attack = attackLower ? target < st.v : target > st.v;
		const tau = attack ? atkMs : relMs;
		st.v += (target - st.v) * (1 - Math.exp(-dtMs / tau));
		return st.v;
	}

	// Per-algorithm presets. Each group owns its own buttons (data-group), inputs,
	// and preset table -- no values are shared between algorithms.
	//   Co-moving: each is a FULL config (spring + lead + setpoint knobs) so
	//   switching is clean. "Gated" is the default: the springy feel (stiff 2500,
	//   zeta 0.5) with the gate active (drop 0.9, driven by the Drop limiter) and a
	//   genuinely co-moving base (basetrk 0.05) so it doesn't snap to raw on a
	//   SLOW->FAST flip. "Snap" is the older fraction-gate config; "Spring" emulates
	//   the Spring algo's feel (basetrk 1, leadrt 10, coast 0, drop/rise 0 -> gate
	//   defeated, flicker and all).
	//   Spring: the Spring algo's own Soft/Calm/Snap over speed/track/anchor/damp.

	comovingPresets = {
		snap: {
			stiffInput: 2500,
			zetaInput: 0.7,
			anchorStiffInput: this.ANCHOR_STIFF,
			leadTimeInput: this.LEAD_MS,
			coastInput: this.COAST,
			baseTrackInput: this.BASE_TRACK,
			leadRateInput: this.LEAD_RATE,
			dropInput: this.VEL_DROP,
			riseInput: this.VEL_RISE,
			vsmoothInput: this.VEL_DET_SMOOTH,
		},
		spring: {
			stiffInput: 2500,
			zetaInput: 0.7,
			anchorStiffInput: this.ANCHOR_STIFF,
			leadTimeInput: this.LEAD_MS,
			coastInput: 0,
			baseTrackInput: 0.01,
			leadRateInput: 10,
			dropInput: 0,
			riseInput: 0,
			vsmoothInput: 0.3,
		},
		gated: {
			stiffInput: 2500,
			zetaInput: 0.5,
			anchorStiffInput: this.ANCHOR_STIFF,
			leadTimeInput: this.LEAD_MS,
			coastInput: 0,
			baseTrackInput: 0.05,
			leadRateInput: 10,
			dropInput: 0.9,
			riseInput: 0,
			vsmoothInput: 0.5,
		},
	};

	springPresets = {
		soft: {
			springSpeedInput: 1.0,
			springTrackInput: 1000,
			springAnchorInput: 1,
			springDampInput: 70,
		},
		calm: {
			springSpeedInput: 1.0,
			springTrackInput: 1600,
			springAnchorInput: 1,
			springDampInput: 80,
		},
		snap: {
			springSpeedInput: 1.0,
			springTrackInput: 2500,
			springAnchorInput: 1,
			springDampInput: 70,
		},
	};

	// --- Orientation -> direction vector ----------------------------------
	// Current device orientation as a unit vector: the image of the screen
	// normal [0,0,1] under the device's rotation.
	cur = [0, 0, 1]; // rendered (predicted) vector
	curVel = [0, 0, 0]; // `cur` velocity, integrated by the settle spring (gives overshoot/coast)
	wasFast = false; // previous-frame gate state, to detect the FAST->SLOW edge
	springBase = [0, 0, 1]; // co-moving spring setpoint base: seeded to `cur` at the SLOW->FAST
	// edge, then advanced by the motion each frame (no onset step)
	leadAcc = 0; // lead angle baked into the moving setpoint, grown from 0 by
	// accumulated motion toward the limited predAngle
	measVec = [0, 0, 1]; // latest measured vector

	// Angular-velocity tracking, used to extrapolate `measVec` forward.
	prevMeas = null; // previous measured vector
	prevMeasTime = 0; // timestamp of that measurement (ms)
	// --- ANGULAR / ROTATIONAL motion, derived from DeviceOrientation (NOT the
	// accelerometer): how the orientation vector is turning. ---
	angSpeed = 0; // smoothed angular speed (rad/s) of the orientation vector
	detVel = 0; // (re)smoothed measured angular speed for the FAST/SLOW peak-detector
	velPeak = 0; // running peak of detVel since the last re-arm
	velValley = 0; // running valley of detVel since entering SLOW
	settleFast = false; // peak-detector state: true = FAST (track), false = SLOW (coast)
	angDecel = 0; // smoothed angular deceleration (rad/s^2): rectified -d(angSpeed)/dt
	angAccel = 0; // smoothed angular acceleration (rad/s^2): rectified +d(angSpeed)/dt
	angAxis = [0, 0, 1]; // axis the vector is rotating about
	lastFrameTime = 0;
	hasData = false; // true once the first orientation reading lands
	// --- LINEAR / TRANSLATIONAL motion, derived from DeviceMotion's accelerometer
	// (NOT orientation): how the phone is being moved/shoved through space. ---
	linAccelMag = 0; // smoothed linear-acceleration magnitude (m/s^2), from e.acceleration
	absJerk = 0; // EMA of |raw linear jerk| (rectify-then-smooth envelope); drives the jerk limiter
	prevLinAccelMag = 0; // previous linear-accel magnitude, for the jerk finite-difference
	prevMotionTime = 0; // timestamp of the last devicemotion sample (ms)

	// --- Sensor recording / playback state --------------------------------
	recording = false;
	playing = false; // mutually exclusive
	recordingTests = false; // true when the current recording is a Rec Tests run
	recBuffer = []; // recorded ticks: { t, k:"o", a,b,g } | { t, k:"m", x,y,z }
	testRuns = null; // generated/loaded test runs: [{ algo,preset,enabled,config,frames,outputs }]
	recStartWall = 0; // performance.now() at record start (t is ms past this)
	playWall = 0;
	playIdx = 0;
	playRaf = 0; // playback cursor + its rAF handle

	// Convert (alpha, beta, gamma) Euler angles (degrees, ZXY order per the
	// W3C DeviceOrientation spec) into a quaternion, then rotate [0,0,1].
	orientationToVector(alphaDeg, betaDeg, gammaDeg) {
		const _z = ((alphaDeg || 0) * Math.PI) / 180; // alpha: around Z
		const _x = ((betaDeg || 0) * Math.PI) / 180; // beta:  around X
		const _y = ((gammaDeg || 0) * Math.PI) / 180; // gamma: around Y

		const cX = Math.cos(_x / 2),
			cY = Math.cos(_y / 2),
			cZ = Math.cos(_z / 2);
		const sX = Math.sin(_x / 2),
			sY = Math.sin(_y / 2),
			sZ = Math.sin(_z / 2);

		// Quaternion for ZXY rotation order.
		const w = cX * cY * cZ - sX * sY * sZ;
		const x = sX * cY * cZ - cX * sY * sZ;
		const y = cX * sY * cZ + sX * cY * sZ;
		const z = cX * cY * sZ + sX * sY * cZ;

		// Rotate the reference vector [0,0,1] by this quaternion: the third
		// column of the corresponding rotation matrix.
		return [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
	}

	// Rotate vector `v` about unit axis `k` by `theta` radians (Rodrigues).
	rotateAround(v, k, theta) {
		const c = Math.cos(theta),
			s = Math.sin(theta);
		const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
		const cx = k[1] * v[2] - k[2] * v[1];
		const cy = k[2] * v[0] - k[0] * v[2];
		const cz = k[0] * v[1] - k[1] * v[0];
		return [
			v[0] * c + cx * s + k[0] * kv * (1 - c),
			v[1] * c + cy * s + k[1] * kv * (1 - c),
			v[2] * c + cz * s + k[2] * kv * (1 - c),
		];
	}

	// Take a freshly measured orientation vector and update both the latest
	// value and the angular-velocity estimate (by finite difference). Shared
	// by the sensor and the pointer fallback.
	ingestVector(newVec, nowOverride) {
		const now = nowOverride != null ? nowOverride : performance.now();
		if (this.prevMeas) {
			const dt = (now - this.prevMeasTime) / 1000;
			if (dt > 0) {
				let cosA =
					this.prevMeas[0] * newVec[0] +
					this.prevMeas[1] * newVec[1] +
					this.prevMeas[2] * newVec[2];
				if (cosA > 1) cosA = 1;
				else if (cosA < -1) cosA = -1;
				const angle = Math.acos(cosA);
				// Rotation axis between the two samples = prevMeas x newVec.
				const ax = this.prevMeas[1] * newVec[2] - this.prevMeas[2] * newVec[1];
				const ay = this.prevMeas[2] * newVec[0] - this.prevMeas[0] * newVec[2];
				const az = this.prevMeas[0] * newVec[1] - this.prevMeas[1] * newVec[0];
				const al = Math.hypot(ax, ay, az);
				const instSpeed = angle / dt;
				const prevSpeed = this.angSpeed;
				this.angSpeed += (instSpeed - this.angSpeed) * this.VEL_SMOOTH;
				// Angular deceleration (rad/s^2), rectified to the slowing-down part
				// only and EMA-smoothed; drives the Angular decel limiter.
				const decel = Math.max(0, (prevSpeed - this.angSpeed) / dt);
				this.angDecel += (decel - this.angDecel) * this.decelSmoothV;
				// Angular acceleration (rad/s^2), rectified to the speeding-up part only;
				// drives the Angular accel limiter (damp the prediction at rotation onset).
				const angAcc = Math.max(0, (this.angSpeed - prevSpeed) / dt);
				this.angAccel += (angAcc - this.angAccel) * this.angAccSmoothV;
				// Detector velocity feeding the FAST/SLOW peak-detector: a (re)smoothed
				// copy of the measured angSpeed (vsmooth = 1.0 follows it raw, for A/B;
				// lower smooths shake reversals where speed dips to ~0 each cycle).
				const detSmooth = this.velSmoothV;
				this.detVel += (this.angSpeed - this.detVel) * detSmooth;
				const gateVel = this.detVel;
				// Peak/valley state machine: FAST while gateVel climbs/holds at its peak;
				// SLOW once it falls below VEL_DROP of the peak (movement winding down,
				// latched to rest); re-arm FAST when it rises VEL_RISE above its valley.
				const dropFrac = this.dropEff; // static drop, or the drop limiter's ramped value
				const riseAbs = this.velRiseV;
				if (this.settleFast) {
					if (gateVel > this.velPeak) this.velPeak = gateVel;
					else if (gateVel < this.velPeak * dropFrac) {
						this.settleFast = false;
						this.velValley = gateVel;
					}
				} else {
					if (gateVel < this.velValley) this.velValley = gateVel;
					if (gateVel > this.velValley + riseAbs) {
						this.settleFast = true;
						this.velPeak = gateVel;
					}
				}
				if (al > 1e-6) this.angAxis = [ax / al, ay / al, az / al];
				this.dbg.oriHz += (1 / dt - this.dbg.oriHz) * 0.1; // DeviceOrientation sample rate (debug)
			}
		}
		this.prevMeas = newVec;
		this.prevMeasTime = now;
		this.measVec = newVec;
		if (!this.hasData) {
			this.hasData = true;
			this.desktopMsg.classList.add("hidden"); // real sensor data → not a desktop
		}
	}

	onOrientation(e) {
		if (this.playing) return; // ignore live sensor while rethis.playing a recording
		if (e.alpha == null && e.beta == null && e.gamma == null) return;
		if (this.recording)
			this.recBuffer.push({
				t: performance.now() - this.recStartWall,
				k: "o",
				a: e.alpha,
				b: e.beta,
				g: e.gamma,
			});
		this.ingestVector(this.orientationToVector(e.alpha, e.beta, e.gamma));
	}

	// Core of the motion handler, callable with explicit values + timestamp so the
	// playback pump can drive it from a recording (passing the recorded `now`).
	processMotion(lx, ly, lz, now) {
		const m = Math.hypot(lx || 0, ly || 0, lz || 0);
		this.linAccelMag += (m - this.linAccelMag) * this.accSmoothV;

		// Jerk: rate of change of the (smoothed) acceleration magnitude. `absJerk` is
		// the rectify-then-smooth envelope (EMA of |raw jerk|) that drives the limiter;
		// staying non-negative, it doesn't dip through zero when jerk changes sign.
		if (this.prevMotionTime) {
			const dt = (now - this.prevMotionTime) / 1000;
			if (dt > 0) {
				const rawJerk = (this.linAccelMag - this.prevLinAccelMag) / dt;
				this.absJerk += (Math.abs(rawJerk) - this.absJerk) * this.ajerkSmoothV;
				this.dbg.motHz += (1 / dt - this.dbg.motHz) * 0.1; // DeviceMotion sample rate (debug)
			}
		}
		this.prevLinAccelMag = this.linAccelMag;
		this.prevMotionTime = now;
	}

	// Track the magnitude of LINEAR acceleration (gravity excluded) from the
	// accelerometer. Feeds the Linear accel + jerk limiters. This is translational
	// motion (moving the phone through space), distinct from the angular/rotational
	// signals (angSpeed/angDecel) derived from DeviceOrientation.
	onMotion(e) {
		if (this.playing) return; // ignore live sensor while rethis.playing a recording
		const lin = e.acceleration;
		if (!lin) return; // device either reports `acceleration` or it doesn't
		if (this.recording)
			this.recBuffer.push({
				t: performance.now() - this.recStartWall,
				k: "m",
				x: lin.x,
				y: lin.y,
				z: lin.z,
			});
		this.processMotion(lin.x, lin.y, lin.z, performance.now());
	}

	// RECORDING
	// --- Sensor recording / playback -------------------------------------
	// Replay drives the SAME ingest path the live sensors use (ingestVector /
	// processMotion), so frame() re-predicts the recorded ticks with whatever
	// algorithm is currently selected. A dedicated rAF pump releases ticks at
	// real-time pace but passes each tick's RECORDED timestamp into the ingest
	// path, so the internal dt matches the original capture. frame() is untouched.

	// Clear the finite-difference history so the first replayed tick - and the
	// seam where the loop wraps from the last tick back to the first - can't
	// compute a bogus dt / velocity spike. (The "start fresh" requirement.)
	resetSensorState() {
		this.prevMeas = null;
		this.prevMeasTime = 0;
		this.prevMotionTime = 0;
		this.prevLinAccelMag = 0;
	}

	// Full clean start for a deterministic run: the finite-difference reset above
	// plus the integrator + FAST/SLOW gate + smoothed-signal state, so stepping a
	// clip from here is reproducible regardless of prior state. Tests call this
	// before feeding a clip; production doesn't need it (live state is continuous).
	resetSimState() {
		this.resetSensorState();
		this.cur = [0, 0, 1];
		this.curVel = [0, 0, 0];
		this.springBase = [0, 0, 1];
		this.leadAcc = 0;
		this.wasFast = false;
		this.settleFast = false;
		this.velPeak = 0;
		this.velValley = 0;
		this.detVel = 0;
		this.angSpeed = 0;
		this.angDecel = 0;
		this.angAccel = 0;
		this.linAccelMag = 0;
		this.absJerk = 0;
	}

	// Fuller reset for a deterministic TEST run: resetSimState plus the pieces it
	// doesn't touch (rotation axis, per-limiter glide states, the drop-gate glide/
	// output, measVec). Seeds the drop glide from the configured static drop, so
	// call this AFTER applyConfig has set velDropV. Without this a prior run's glide
	// state would leak and break bit-exact reproducibility.
	resetTestState() {
		this.resetSimState();
		this.angAxis = [0, 0, 1];
		this.measVec = [0, 0, 1];
		this.accGl.v = 1;
		this.ajerkGl.v = 1;
		this.decelGl.v = 1;
		this.angAccGl.v = 1;
		this.dropGl.v = this.velDropV;
		this.dropEff = this.velDropV;
	}

	playbackTick(now) {
		if (!this.playing) return;
		const elapsed = now - this.playWall;
		while (
			this.playIdx < this.recBuffer.length &&
			this.recBuffer[this.playIdx].t <= elapsed
		) {
			const ev = this.recBuffer[this.playIdx++];
			// Feed a real-clock timestamp (playWall + recorded offset): the gap between
			// ticks equals the recorded dt, but the value stays on performance.now()'s
			// clock so frame()'s staleness check (now - prevMeasTime) reads correctly.
			const evNow = this.playWall + ev.t;
			if (ev.k === "o")
				this.ingestVector(this.orientationToVector(ev.a, ev.b, ev.g), evNow);
			else this.processMotion(ev.x, ev.y, ev.z, evNow);
		}
		if (this.playIdx >= this.recBuffer.length) {
			// loop: restart fresh at the seam
			this.playIdx = 0;
			this.playWall = now;
			this.resetSensorState();
		}
		this.playRaf = requestAnimationFrame(() => this.playbackTick());
	}

	startPlayback() {
		if (!this.recBuffer.length || this.playing) return;
		if (this.recording) this.stopRecording();
		this.playing = true;
		this.playIdx = 0;
		this.playWall = performance.now();
		this.resetSensorState();
		this.updateRecUI();
		this.playRaf = requestAnimationFrame(() => this.playbackTick());
	}
	stopPlayback() {
		if (!this.playing) return;
		this.playing = false;
		if (this.playRaf) cancelAnimationFrame(this.playRaf);
		this.playRaf = 0;
		this.resetSensorState(); // hand cleanly back to the live sensor
		this.updateRecUI();
	}

	startRecording(tests) {
		if (this.playing) this.stopPlayback();
		this.recBuffer = [];
		this.testRuns = null;
		this.recStartWall = performance.now();
		this.recording = true;
		this.recordingTests = !!tests;
		this.updateRecUI();
	}
	stopRecording() {
		if (!this.recording) return;
		this.recording = false;
		const wasTests = this.recordingTests;
		this.recordingTests = false;
		// A Rec Tests run post-processes on stop: replay the captured input through
		// the matrix of algorithms/configs and store the outputs (see generateTests).
		if (wasTests && this.recBuffer.length) this.generateTests();
		this.updateRecUI();
	}

	// A clip is { v:2, events, tests }. `events` are the raw input ticks; `tests`
	// (may be null) are the generated test runs - each an algorithm/config plus its
	// recorded predicted outputs (see generateTests / verifyTests).
	async saveRecording() {
		if (!this.recBuffer.length) return;
		const clip = { v: 2, events: this.recBuffer, tests: this.testRuns };
		// Gzip the JSON via the Compression Streams API before download.
		const gz = new Blob([JSON.stringify(clip)], { type: "application/json" })
			.stream()
			.pipeThrough(new CompressionStream("gzip"));
		const blob = await new Response(gz).blob();
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download =
			"shimmery-recording-" +
			new Date().toISOString().replace(/[:.]/g, "-") +
			".json.gzip";
		a.click();
		URL.revokeObjectURL(url);
	}
	async loadRecording(file) {
		try {
			// Gunzip the file stream, then parse the JSON.
			const stream = file.stream().pipeThrough(new DecompressionStream("gzip"));
			const text = await new Response(stream).text();
			const data = JSON.parse(text);
			const events = Array.isArray(data) ? data : data && data.events;
			if (Array.isArray(events)) {
				this.stopPlayback();
				this.recBuffer = events;
				this.testRuns = data && Array.isArray(data.tests) ? data.tests : null;
				this.updateRecUI();
			}
		} catch (_) {
			/* ignore malformed or non-gzip file */
		}
	}

	// --- Test framework ---------------------------------------------------
	// Deterministically replays recorded input through the prediction algorithm for
	// a matrix of algorithms/configs (Rec tests), and re-checks stored outputs
	// against the current algorithm (Verify). All headless: no rAF, no canvas.

	// The 7 guards/options iterated per algorithm.
	TEST_TOGGLES = [
		"accelLimiter",
		"absJerkLimiter",
		"angAccelLimiter",
		"decelLimiter",
		"dropLimiter",
		"leadComp",
		"smoothing",
	];
	// Map a preset field (input id) to the tunable it drives, mirroring bindThreshold.
	PRESET_FIELD_TO_VAR = {
		stiffInput: "springStiffV",
		zetaInput: "springZetaV",
		anchorStiffInput: "anchorV",
		leadTimeInput: "leadTimeV",
		coastInput: "coastV",
		baseTrackInput: "baseTrackV",
		leadRateInput: "leadRateV",
		dropInput: "velDropV",
		riseInput: "velRiseV",
		vsmoothInput: "velSmoothV",
		springSpeedInput: "springSpeedV",
		springTrackInput: "springTrackV",
		springAnchorInput: "springAnchorV",
		springDampInput: "springDampV",
	};

	// Snapshot / restore every debug-editable tunable (the algorithm reads these
	// `*V` copies when debug is on, which the driver forces).
	snapshotValues() {
		return {
			accLowV: this.accLowV,
			accHighV: this.accHighV,
			accSmoothV: this.accSmoothV,
			accAtkV: this.accAtkV,
			accRelV: this.accRelV,
			ajerkLowV: this.ajerkLowV,
			ajerkHighV: this.ajerkHighV,
			ajerkSmoothV: this.ajerkSmoothV,
			ajerkAtkV: this.ajerkAtkV,
			ajerkRelV: this.ajerkRelV,
			decelLowV: this.decelLowV,
			decelHighV: this.decelHighV,
			decelSmoothV: this.decelSmoothV,
			decelAtkV: this.decelAtkV,
			decelRelV: this.decelRelV,
			angAccLowV: this.angAccLowV,
			angAccHighV: this.angAccHighV,
			angAccSmoothV: this.angAccSmoothV,
			angAccAtkV: this.angAccAtkV,
			angAccRelV: this.angAccRelV,
			dropLowV: this.dropLowV,
			dropHighV: this.dropHighV,
			dropMinV: this.dropMinV,
			dropMaxV: this.dropMaxV,
			dropAtkV: this.dropAtkV,
			dropRelV: this.dropRelV,
			curSmoothV: this.curSmoothV,
			leadTimeV: this.leadTimeV,
			anchorV: this.anchorV,
			springStiffV: this.springStiffV,
			springZetaV: this.springZetaV,
			coastV: this.coastV,
			baseTrackV: this.baseTrackV,
			leadRateV: this.leadRateV,
			springSpeedV: this.springSpeedV,
			springTrackV: this.springTrackV,
			springAnchorV: this.springAnchorV,
			springDampV: this.springDampV,
			velDropV: this.velDropV,
			velRiseV: this.velRiseV,
			velSmoothV: this.velSmoothV,
		};
	}
	applyValues(v) {
		this.accLowV = v.accLowV;
		this.accHighV = v.accHighV;
		this.accSmoothV = v.accSmoothV;
		this.accAtkV = v.accAtkV;
		this.accRelV = v.accRelV;
		this.ajerkLowV = v.ajerkLowV;
		this.ajerkHighV = v.ajerkHighV;
		this.ajerkSmoothV = v.ajerkSmoothV;
		this.ajerkAtkV = v.ajerkAtkV;
		this.ajerkRelV = v.ajerkRelV;
		this.decelLowV = v.decelLowV;
		this.decelHighV = v.decelHighV;
		this.decelSmoothV = v.decelSmoothV;
		this.decelAtkV = v.decelAtkV;
		this.decelRelV = v.decelRelV;
		this.angAccLowV = v.angAccLowV;
		this.angAccHighV = v.angAccHighV;
		this.angAccSmoothV = v.angAccSmoothV;
		this.angAccAtkV = v.angAccAtkV;
		this.angAccRelV = v.angAccRelV;
		this.dropLowV = v.dropLowV;
		this.dropHighV = v.dropHighV;
		this.dropMinV = v.dropMinV;
		this.dropMaxV = v.dropMaxV;
		this.dropAtkV = v.dropAtkV;
		this.dropRelV = v.dropRelV;
		this.curSmoothV = v.curSmoothV;
		this.leadTimeV = v.leadTimeV;
		this.anchorV = v.anchorV;
		this.springStiffV = v.springStiffV;
		this.springZetaV = v.springZetaV;
		this.coastV = v.coastV;
		this.baseTrackV = v.baseTrackV;
		this.leadRateV = v.leadRateV;
		this.springSpeedV = v.springSpeedV;
		this.springTrackV = v.springTrackV;
		this.springAnchorV = v.springAnchorV;
		this.springDampV = v.springDampV;
		this.velDropV = v.velDropV;
		this.velRiseV = v.velRiseV;
		this.velSmoothV = v.velSmoothV;
	}

	// Overlay a preset's settle knobs onto a base value snapshot (no live mutation).
	presetValues(base, settleMode, presetName) {
		const out = { ...base };
		const preset =
			settleMode === "spring"
				? this.springPresets[presetName]
				: settleMode === "comoving"
					? this.comovingPresets[presetName]
					: null;
		if (preset) {
			for (const field in preset) {
				const key = this.PRESET_FIELD_TO_VAR[field];
				if (!key) continue;
				out[key] =
					field === "leadTimeInput" ? preset[field] / 1000 : preset[field]; // ms -> s
			}
		}
		return out;
	}

	// Apply a run config to live state (flags + settle mode + tunables). No DOM.
	applyConfig(config) {
		this._settleMode = config.settleMode;
		this._inertia = this._settleMode !== "velocity";
		this._prediction = true;
		this.debugOn = true; // force debug on
		const f = config.flags;
		this._accelLimiter = f.accelLimiter;
		this._absJerkLimiter = f.absJerkLimiter;
		this._angAccelLimiter = f.angAccelLimiter;
		this._decelLimiter = f.decelLimiter;
		this._dropLimiter = f.dropLimiter;
		this._leadComp = f.leadComp;
		this._smoothing = f.smoothing;
		this.applyValues(config.values);
	}

	// Save / restore all state the driver mutates, so live rendering is undisturbed.
	snapshotLiveState() {
		return {
			settleMode: this._settleMode,
			inertia: this._inertia,
			prediction: this._prediction,
			debugOn: this.debugOn,
			flags: {
				accelLimiter: this._accelLimiter,
				absJerkLimiter: this._absJerkLimiter,
				angAccelLimiter: this._angAccelLimiter,
				decelLimiter: this._decelLimiter,
				dropLimiter: this._dropLimiter,
				leadComp: this._leadComp,
				smoothing: this._smoothing,
			},
			values: this.snapshotValues(),
			sim: {
				cur: this.cur.slice(),
				curVel: this.curVel.slice(),
				springBase: this.springBase.slice(),
				leadAcc: this.leadAcc,
				wasFast: this.wasFast,
				angSpeed: this.angSpeed,
				detVel: this.detVel,
				velPeak: this.velPeak,
				velValley: this.velValley,
				settleFast: this.settleFast,
				angDecel: this.angDecel,
				angAccel: this.angAccel,
				angAxis: this.angAxis.slice(),
				linAccelMag: this.linAccelMag,
				absJerk: this.absJerk,
				prevLinAccelMag: this.prevLinAccelMag,
				measVec: this.measVec.slice(),
				prevMeas: this.prevMeas ? this.prevMeas.slice() : null,
				prevMeasTime: this.prevMeasTime,
				prevMotionTime: this.prevMotionTime,
				hasData: this.hasData,
				accGl: this.accGl.v,
				ajerkGl: this.ajerkGl.v,
				decelGl: this.decelGl.v,
				angAccGl: this.angAccGl.v,
				dropGl: this.dropGl.v,
				dropEff: this.dropEff,
			},
		};
	}
	restoreLiveState(s) {
		this._settleMode = s.settleMode;
		this._inertia = s.inertia;
		this._prediction = s.prediction;
		this.debugOn = s.debugOn;
		this._accelLimiter = s.flags.accelLimiter;
		this._absJerkLimiter = s.flags.absJerkLimiter;
		this._angAccelLimiter = s.flags.angAccelLimiter;
		this._decelLimiter = s.flags.decelLimiter;
		this._dropLimiter = s.flags.dropLimiter;
		this._leadComp = s.flags.leadComp;
		this._smoothing = s.flags.smoothing;
		this.applyValues(s.values);
		const m = s.sim;
		this.cur = m.cur.slice();
		this.curVel = m.curVel.slice();
		this.springBase = m.springBase.slice();
		this.leadAcc = m.leadAcc;
		this.wasFast = m.wasFast;
		this.angSpeed = m.angSpeed;
		this.detVel = m.detVel;
		this.velPeak = m.velPeak;
		this.velValley = m.velValley;
		this.settleFast = m.settleFast;
		this.angDecel = m.angDecel;
		this.angAccel = m.angAccel;
		this.angAxis = m.angAxis.slice();
		this.linAccelMag = m.linAccelMag;
		this.absJerk = m.absJerk;
		this.prevLinAccelMag = m.prevLinAccelMag;
		this.measVec = m.measVec.slice();
		this.prevMeas = m.prevMeas ? m.prevMeas.slice() : null;
		this.prevMeasTime = m.prevMeasTime;
		this.prevMotionTime = m.prevMotionTime;
		this.hasData = m.hasData;
		this.accGl.v = m.accGl;
		this.ajerkGl.v = m.ajerkGl;
		this.decelGl.v = m.decelGl;
		this.angAccGl.v = m.angAccGl;
		this.dropGl.v = m.dropGl;
		this.dropEff = m.dropEff;
	}

	// The deterministic driver: replay `events` through the algorithm under `config`,
	// stepping at a fixed 60 fps. Sensor ticks are released by their recorded ms
	// timestamp (same clock as the frame `now`), so ingest dt matches capture and the
	// staleness guard reads correctly. Returns one predicted vector per frame.
	runClip(config, events) {
		this.applyConfig(config);
		this.resetTestState();
		const frameMs = 1000 / 60,
			dt = 1 / 60;
		const lastT = events.length ? events[events.length - 1].t : 0;
		const nFrames = Math.floor(lastT / frameMs) + 1;
		let ei = 0;
		const out = [];
		for (let i = 0; i < nFrames; i++) {
			const simT = i * frameMs;
			while (ei < events.length && events[ei].t <= simT) {
				const ev = events[ei++];
				if (ev.k === "o")
					this.ingestVector(this.orientationToVector(ev.a, ev.b, ev.g), ev.t);
				else this.processMotion(ev.x, ev.y, ev.z, ev.t);
			}
			this.stepPrediction(simT, dt);
			out.push(this.cur.slice());
		}
		return out;
	}

	// The (settleMode, preset) algorithms to test. Velocity has no preset.
	testAlgorithms(base) {
		const list = [{ algo: "velocity", preset: null, values: base }];
		for (const p of Object.keys(this.springPresets))
			list.push({
				algo: "spring",
				preset: p,
				values: this.presetValues(base, "spring", p),
			});
		for (const p of Object.keys(this.comovingPresets))
			list.push({
				algo: "comoving",
				preset: p,
				values: this.presetValues(base, "comoving", p),
			});
		return list;
	}
	// Per algorithm: a baseline (all toggles off) + one run per single toggle enabled.
	testConfigs() {
		const off = {};
		for (const t of this.TEST_TOGGLES) off[t] = false;
		const runs = [{ enabled: "baseline", flags: { ...off } }];
		for (const t of this.TEST_TOGGLES)
			runs.push({ enabled: t, flags: { ...off, [t]: true } });
		return runs;
	}

	// Rec tests stop-hook: compute every run's outputs and store them in testRuns.
	generateTests() {
		const base = this.snapshotValues();
		const saved = this.snapshotLiveState();
		const runs = [];
		try {
			for (const alg of this.testAlgorithms(base)) {
				for (const cfg of this.testConfigs()) {
					const config = {
						settleMode: alg.algo,
						flags: cfg.flags,
						values: alg.values,
					};
					const out = this.runClip(config, this.recBuffer);
					runs.push({
						algo: alg.algo,
						preset: alg.preset,
						enabled: cfg.enabled,
						config,
						frames: out.length,
						outputs: out,
					});
				}
			}
		} finally {
			this.restoreLiveState(saved);
		}
		this.testRuns = runs;
	}

	// Verify: re-run each stored config through the CURRENT algorithm and compare
	// outputs bit-exactly to what was stored. Reports pass/fail per run.
	verifyTests() {
		if (!this.testRuns || !this.testRuns.length || !this.recBuffer.length)
			return;
		const saved = this.snapshotLiveState();
		const results = [];
		try {
			for (const test of this.testRuns) {
				const out = this.runClip(test.config, this.recBuffer);
				const exp = test.outputs || [];
				let pass = out.length === exp.length;
				let bad = -1;
				if (pass) {
					for (let i = 0; i < out.length; i++) {
						if (
							out[i][0] !== exp[i][0] ||
							out[i][1] !== exp[i][1] ||
							out[i][2] !== exp[i][2]
						) {
							pass = false;
							bad = i;
							break;
						}
					}
				} else {
					bad = Math.min(out.length, exp.length);
				}
				results.push({
					test,
					pass,
					bad,
					got: bad >= 0 ? out[bad] : null,
					want: bad >= 0 ? exp[bad] : null,
				});
			}
		} finally {
			this.restoreLiveState(saved);
		}
		this.showTestModal(results);
	}

	testModal = document.getElementById("testModal");
	showTestModal(results) {
		const passed = results.filter((r) => r.pass).length;
		const summary = document.getElementById("testSummary");
		const body = document.getElementById("testBody");
		summary.textContent = passed + "/" + results.length + " passed";
		summary.style.color = passed === results.length ? "#5ec26b" : "#ff5b5b";
		const fmt = (v) =>
			v ? "[" + v.map((n) => n.toFixed(4)).join(", ") + "]" : "-";
		body.innerHTML = "";
		for (const r of results) {
			const row = document.createElement("div");
			row.className = "test-row " + (r.pass ? "test-pass" : "test-fail");
			const name =
				r.test.algo +
				(r.test.preset ? "/" + r.test.preset : "") +
				" · " +
				r.test.enabled;
			const detail = r.pass
				? ""
				: '<span class="test-detail">frame ' +
					r.bad +
					": got " +
					fmt(r.got) +
					" want " +
					fmt(r.want) +
					"</span>";
			row.innerHTML =
				'<span class="test-name">' +
				name +
				detail +
				"</span>" +
				'<span class="test-verdict">' +
				(r.pass ? "PASS" : "FAIL") +
				"</span>";
			body.appendChild(row);
		}
		this.testModal.classList.remove("hidden");
	}

	// DOM wiring for the recording bar.
	recSaveBtn = document.getElementById("recSaveBtn");
	recLoadBtn = document.getElementById("recLoadBtn");
	recRecordBtn = document.getElementById("recRecordBtn");
	recPlayBtn = document.getElementById("recPlayBtn");
	recTestsBtn = document.getElementById("recTestsBtn");
	recVerifyBtn = document.getElementById("recVerifyBtn");
	recStatus = document.getElementById("recStatus");
	recFileInput = document.getElementById("recFileInput");

	updateRecUI() {
		const n = this.recBuffer.length;
		const plainRec = this.recording && !this.recordingTests;
		const testsRec = this.recording && this.recordingTests;
		this.recRecordBtn.classList.toggle("rec-on", plainRec);
		this.recRecordBtn.textContent = plainRec ? "■ Stop" : "● Rec";
		this.recPlayBtn.classList.toggle("active", this.playing);
		this.recPlayBtn.textContent = this.playing ? "■ Stop" : "▶ Play";
		this.recTestsBtn.classList.toggle("rec-on", testsRec);
		this.recTestsBtn.textContent = testsRec ? "■ Stop" : "● Rec tests";
		// While recording or playing, the other transports are locked out.
		this.recSaveBtn.disabled = !n || this.recording;
		this.recPlayBtn.disabled = (!n && !this.playing) || this.recording;
		this.recRecordBtn.disabled = this.playing || testsRec;
		this.recTestsBtn.disabled = this.playing || plainRec;
		this.recVerifyBtn.disabled =
			!(this.testRuns && this.testRuns.length) || this.recording;
		this.recStatus.textContent = testsRec
			? "● tests " + n
			: plainRec
				? "● " + n
				: this.playing
					? "▶ playing"
					: this.testRuns && this.testRuns.length
						? this.testRuns.length + " tests"
						: n
							? n + " ticks"
							: "no clip";
	}

	// --- Debug overlay ----------------------------------------------------
	// Values computed inside frame() that the overlay needs to read back.
	dbg = {
		damp: 1,
		targetDamp: 1,
		accDamp: 1,
		aJerkDamp: 1,
		decelDamp: 1,
		drive: 1,
		vel: 0,
		peak: 0,
		predAngle: 0,
		fps: 0,
		oriHz: 0,
		motHz: 0,
	};

	// Each metric: a live accessor, a bar range, and a formatter. `bip` draws a
	// bipolar bar growing out from the center; `ticks` marks thresholds (accel).
	debugMetrics = [
		{
			label: "lin acc",
			get: () => this.linAccelMag,
			min: 0,
			max: 8,
			enabled: () => this._accelLimiter,
			ticks: [
				{ at: () => this.accLowV, color: "#ff9b3b", dashed: true },
				{ at: () => this.accHighV, color: "#ff5b5b" },
			],
			color: (v) =>
				v >= this.accHighV
					? "#ff5b5b"
					: v >= this.accLowV
						? "#ff9b3b"
						: "#5b9bff",
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "absJerk",
			get: () => this.absJerk,
			min: 0,
			max: 50,
			enabled: () => this._absJerkLimiter,
			ticks: [
				{ at: () => this.ajerkLowV, color: "#ff9b3b", dashed: true },
				{ at: () => this.ajerkHighV, color: "#ff5b5b" },
			],
			color: (v) =>
				v >= this.ajerkHighV
					? "#ff5b5b"
					: v >= this.ajerkLowV
						? "#ff9b3b"
						: "#5b9bff",
			fmt: (v) => v.toFixed(1),
		},
		// Angular signals (rad/s, rad/s^2) from DeviceOrientation, grouped together.
		{
			label: "ang vel",
			get: () => this.angSpeed,
			min: 0,
			max: 6,
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "ang acc",
			get: () => this.angAccel,
			min: 0,
			max: 40,
			enabled: () => this._angAccelLimiter,
			ticks: [
				{ at: () => this.angAccLowV, color: "#ff9b3b", dashed: true },
				{ at: () => this.angAccHighV, color: "#ff5b5b" },
			],
			color: (v) =>
				v >= this.angAccHighV
					? "#ff5b5b"
					: v >= this.angAccLowV
						? "#ff9b3b"
						: "#5b9bff",
			fmt: (v) => v.toFixed(1),
		},
		// ang dec drives the Angular decel limiter AND Dynamic speed (active if either on).
		{
			label: "ang dec",
			get: () => this.angDecel,
			min: 0,
			max: 40,
			enabled: () => this._decelLimiter,
			tickEnabled: () => this._decelLimiter,
			ticks: [
				{ at: () => this.decelLowV, color: "#ff9b3b", dashed: true },
				{ at: () => this.decelHighV, color: "#ff5b5b" },
			],
			color: (v) =>
				v >= this.decelHighV
					? "#ff5b5b"
					: v >= this.decelLowV
						? "#ff9b3b"
						: "#5b9bff",
			fmt: (v) => v.toFixed(1),
		},
		{
			label: "drive",
			get: () => this.dbg.drive,
			min: 0,
			max: 1,
			enabled: () => this._inertia,
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "vel",
			get: () => this.dbg.vel,
			min: 0,
			max: 6,
			enabled: () => this._inertia,
			ticks: [
				{ at: () => this.dbg.peak, color: "#5bff9b" },
				{
					at: () =>
						this.dbg.peak * (this._dropLimiter ? this.dropEff : this.velDropV),
					color: "#ff9b3b",
					dashed: true,
				},
			],
			color: () => (this.settleFast ? "#5b9bff" : "rgba(255,255,255,0.4)"),
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "drop",
			get: () => this.dropEff,
			min: 0,
			max: 1,
			enabled: () => this._dropLimiter,
			ticks: [
				{ at: () => this.dropMinV, color: "#ff9b3b", dashed: true },
				{ at: () => this.dropMaxV, color: "#ff5b5b" },
			],
			color: (v) => (v >= 0.6 ? "#ff5b5b" : v >= 0.3 ? "#ff9b3b" : "#5b9bff"),
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "lead ms",
			get: () => this.leadTimeV * 1000,
			min: 0,
			max: 120,
			enabled: () => this._inertia,
			fmt: (v) => v.toFixed(0),
		},
		{
			label: "lag ms",
			get: () =>
				this._leadComp && this._inertia ? 1000 * this.settleLagSec() : 0,
			min: 0,
			max: 120,
			enabled: () => this._leadComp && this._inertia,
			fmt: (v) => v.toFixed(0),
		},
		{
			label: "tgtDamp",
			get: () => this.dbg.targetDamp,
			min: 0,
			max: 1,
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "damp",
			get: () => this.dbg.damp,
			min: 0,
			max: 1,
			fmt: (v) => v.toFixed(2),
		},
		{
			label: "predAng",
			get: () => this.dbg.predAngle,
			min: -this.MAX_LEAD_ANGLE,
			max: this.MAX_LEAD_ANGLE,
			bip: true,
			fmt: (v) => v.toFixed(3),
		},
		// Compact: x/y/z as three mini bipolar bars in one row, no per-axis text/value.
		{ label: "meas", multi: () => this.measVec, min: -1, max: 1, bip: true },
		{ label: "pred", multi: () => this.cur, min: -1, max: 1, bip: true },
		// Effective easing coefficient of the velocity-easing path: curSmoothV while
		// predicting with smoothing on, else 1 (snap). Raw Sensor mode forces both off.
		{
			label: "smooth",
			text: () =>
				(this._prediction && this._smoothing ? this.curSmoothV : 1).toFixed(2),
		},
		// Compact: frame / orientation / motion sample rates as one text row.
		{
			label: "fps",
			text: () =>
				"f" +
				this.dbg.fps.toFixed(0) +
				" o" +
				this.dbg.oriHz.toFixed(0) +
				" m" +
				this.dbg.motHz.toFixed(0),
		},
	];

	// A tick's background: a solid line, or a dashed one for the orange LOW
	// thresholds. The dash is a height-relative gradient - 3 equal dashes split
	// by 2 gaps (each 1/5 of the bar height) - so it's always exactly 3 parts.
	tickBg(color, dashed) {
		return dashed
			? "linear-gradient(to bottom, " +
					color +
					" 0 20%, transparent 20% 40%, " +
					color +
					" 40% 60%, transparent 60% 80%, " +
					color +
					" 80% 100%)"
			: color;
	}

	debugPanel = document.getElementById("debug");

	// Build the rows once and cache the fill/value elements for fast updates.
	buildDebug() {
		console.log(this.debugPanel);
		const head = document.createElement("h3");
		head.textContent = "Debug";
		this.debugPanel.appendChild(head);
		for (const m of this.debugMetrics) {
			const row = document.createElement("div");
			row.className = "dbg-row";

			const label = document.createElement("span");
			label.className = "dbg-label";
			label.textContent = m.label;
			row.appendChild(label);

			// Text row: label + a single plain-text value, no bar (e.g. the fps trio).
			if (m.text) {
				const val = document.createElement("span");
				val.className = "dbg-text";
				row.appendChild(val);
				this.debugPanel.appendChild(row);
				m._text = val;
				continue;
			}

			// Multi row: several mini bars sharing one row, no value (e.g. meas/pred xyz).
			if (m.multi) {
				const group = document.createElement("div");
				group.className = "dbg-multi";
				m._fills = [];
				for (let i = 0; i < m.multi().length; i++) {
					const t = document.createElement("div");
					t.className = "dbg-track" + (m.bip ? " bip" : "");
					const f = document.createElement("div");
					f.className = "dbg-fill";
					t.appendChild(f);
					group.appendChild(t);
					m._fills.push(f);
				}
				row.appendChild(group);
				this.debugPanel.appendChild(row);
				continue;
			}

			const track = document.createElement("div");
			track.className = "dbg-track" + (m.bip ? " bip" : "");
			const fill = document.createElement("div");
			fill.className = "dbg-fill";
			track.appendChild(fill);
			if (m.ticks) {
				m._tickEls = [];
				for (const t of m.ticks) {
					const tick = document.createElement("div");
					tick.className = "dbg-tick";
					tick.style.background = this.tickBg(t.color, t.dashed);
					track.appendChild(tick);
					m._tickEls.push(tick); // position set live in updateDebug
				}
			}

			const val = document.createElement("span");
			val.className = "dbg-val";

			row.appendChild(track);
			row.appendChild(val);
			this.debugPanel.appendChild(row);
			m._fill = fill;
			m._val = val;
		}
	}

	// Map each metric to a bar width/position and refresh its number.
	// Position a fill within its track for a value in [min,max], bipolar or not.
	setFill(fill, value, min, max, bip) {
		let pct = (value - min) / (max - min);
		if (pct < 0) pct = 0;
		else if (pct > 1) pct = 1;
		if (bip) {
			if (pct >= 0.5) {
				fill.style.left = "50%";
				fill.style.width = (pct - 0.5) * 100 + "%";
			} else {
				fill.style.left = pct * 100 + "%";
				fill.style.width = (0.5 - pct) * 100 + "%";
			}
		} else {
			fill.style.left = "0";
			fill.style.width = pct * 100 + "%";
		}
	}

	updateDebug() {
		console.log("updateDebug");
		for (const m of this.debugMetrics) {
			if (m.text) {
				m._text.textContent = m.text();
				continue;
			}
			if (m.multi) {
				const vals = m.multi();
				for (let i = 0; i < m._fills.length; i++)
					this.setFill(m._fills[i], vals[i], m.min, m.max, m.bip);
				continue;
			}
			const v = m.get();
			const fill = m._fill;
			this.setFill(fill, v, m.min, m.max, m.bip);
			// A limited metric whose limiter is off keeps the default fill and gray ticks.
			const enabled = m.enabled ? m.enabled() : true;
			fill.style.background =
				m.color && enabled
					? m.color(v)
					: m.warn && m.warn()
						? "#ff5b5b"
						: "#5b9bff";
			m._val.textContent = m.fmt(v);

			// Reposition threshold ticks live (they track the debug-editable bands),
			// graying them out when the metric's limiter is disabled.
			if (m._tickEls) {
				for (let i = 0; i < m._tickEls.length; i++) {
					const at = m.ticks[i].at();
					m._tickEls[i].style.left =
						(100 * (at - m.min)) / (m.max - m.min) + "%";
					const ticksOn = m.tickEnabled ? m.tickEnabled() : enabled;
					const tickColor = ticksOn
						? m.ticks[i].color
						: "rgba(255,255,255,0.25)";
					m._tickEls[i].style.background = this.tickBg(
						tickColor,
						m.ticks[i].dashed,
					);
				}
			}
		}
	}

	// Group delay (seconds) of the active settle algorithm tracking a ramp, which
	// lead compensation pre-pays so the result lands the full lead ahead despite the
	// spring's lag. Co-moving: c/k = 2*zeta/sqrt(stiff). Spring: damp/track (its form).
	settleLagSec() {
		if (this._settleMode === "spring")
			return this.springTrackV > 0 ? this.springDampV / this.springTrackV : 0;
		if (this._settleMode === "comoving")
			return this.springStiffV > 0
				? (2 * this.springZetaV) / Math.sqrt(this.springStiffV)
				: 0;
		return 0;
	}

	// --- Prediction / settle step (pure) ---------------------------------
	// Takes injected (now, dt) - from the rAF driver in production or a synthetic
	// driver in tests - so it reads no wall clock and touches no DOM. Advances the
	// sim state (cur/curVel/springBase/leadAcc/gate) and stashes debug read-backs
	// into `dbg`. Returns the predicted vector `cur`.
	stepPrediction(now, dt) {
		const frameDt = dt;

		// If readings have stopped arriving (device held still), relax the
		// velocity so the prediction doesn't keep drifting.
		if (now - this.prevMeasTime > this.STALE_MS) {
			this.angSpeed = 0;
			this.angDecel = 0;
			this.detVel = 0;
			this.velPeak = 0;
			this.velValley = 0;
			this.settleFast = false; // reset detector to SLOW
			this.curVel[0] = this.curVel[1] = this.curVel[2] = 0; // and the spring-settle velocity
			this.springBase = this.cur.slice();
			this.leadAcc = 0; // and the co-moving setpoint
		}

		// Predict the orientation LEAD_MS ahead from angular velocity. (An
		// acceleration term was dropped: a 2nd derivative of low-rate, quantized
		// orientation is noise-dominated - amplified ~1/dt² - and flickered the
		// prediction frame-to-frame.)
		// Lead = the velocity-scaled angle over the user's lead time. The settle
		// spring lags its target by c/k seconds, eating into the lead; if Lead
		// compensation is on, pre-pay that lag by extending the lead so the displayed
		// result lands the full lead ahead (borrowed from main's inertial settle).
		let lead =
			this._settleMode === "comoving" ? this.leadTimeV : this.LEAD_MS / 1000;
		if (this._leadComp && this._inertia) lead += this.settleLagSec();
		let predAngle = this.angSpeed * lead;
		if (predAngle > this.MAX_LEAD_ANGLE) predAngle = this.MAX_LEAD_ANGLE;
		else if (predAngle < -this.MAX_LEAD_ANGLE) predAngle = -this.MAX_LEAD_ANGLE;

		// Linear accel limiter: as LINEAR acceleration (DeviceMotion) rises from ACC_LOW to ACC_HIGH, ramp
		// the prediction down to zero so a fast shove can't amplify jitter.
		// (In debug mode the band is taken from the live editors, else the constants.)
		const accLow = this.accLowV;
		const accHigh = this.accHighV;
		let accDamp = 1 - (this.linAccelMag - accLow) / (accHigh - accLow);
		if (accDamp < 0) accDamp = 0;
		else if (accDamp > 1) accDamp = 1;

		// AbsJerk limiter: ramp keyed off the rectify-then-smooth envelope.
		const ajerkLow = this.ajerkLowV;
		const ajerkHigh = this.ajerkHighV;
		let aJerkDamp = 1 - (this.absJerk - ajerkLow) / (ajerkHigh - ajerkLow);
		if (aJerkDamp < 0) aJerkDamp = 0;
		else if (aJerkDamp > 1) aJerkDamp = 1;

		// Angular decel limiter (idea 1): ramp keyed off ANGULAR deceleration (rotation
		// rate slowing, from DeviceOrientation), damping the prediction as a rotation
		// ends abruptly so the lagging lead can't overshoot.
		const decLow = this.decelLowV;
		const decHigh = this.decelHighV;
		let decelDamp = 1 - (this.angDecel - decLow) / (decHigh - decLow);
		if (decelDamp < 0) decelDamp = 0;
		else if (decelDamp > 1) decelDamp = 1;

		// Angular accel limiter: ramp keyed off angular acceleration (rotation onset),
		// damping the prediction as a flick starts so a sharp start can't overshoot.
		const aaLow = this.angAccLowV;
		const aaHigh = this.angAccHighV;
		let angAccDamp = 1 - (this.angAccel - aaLow) / (aaHigh - aaLow);
		if (angAccDamp < 0) angAccDamp = 0;
		else if (angAccDamp > 1) angAccDamp = 1;

		// Per-limiter damp glide: ease each limiter's raw ramp toward its target with
		// its own attack (engaging more damping) / release (backing off) times so no
		// limiter snaps `damp` and causes its own flicker. The instantaneous ramps
		// above feed the debug bars; the glided values feed the applied damping.
		const dtMs = frameDt * 1000;
		const accG = this.glide(
			this.accGl,
			accDamp,
			this._accGlide,
			this.accAtkV,
			this.accRelV,
			dtMs,
			true,
		);
		const aJerkG = this.glide(
			this.ajerkGl,
			aJerkDamp,
			this._ajerkGlide,
			this.ajerkAtkV,
			this.ajerkRelV,
			dtMs,
			true,
		);
		const decelG = this.glide(
			this.decelGl,
			decelDamp,
			this._decelGlide,
			this.decelAtkV,
			this.decelRelV,
			dtMs,
			true,
		);
		const angAccG = this.glide(
			this.angAccGl,
			angAccDamp,
			this._angAccGlide,
			this.angAccAtkV,
			this.angAccRelV,
			dtMs,
			true,
		);

		// Drop limiter: ramp the co-moving gate's drop fraction up with the motion's
		// PEAK speed (velPeak) so slow motions stay springy and fast ones clamp at the
		// tail. Off -> the static drop field. The gate (in ingestVector) reads dropEff.
		// "attack" here is the value RISING toward more clamping (attackLower=false).
		const dropLow = this.dropLowV;
		const dropHigh = this.dropHighV;
		let dropRamp = (this.velPeak - dropLow) / (dropHigh - dropLow);
		if (dropRamp < 0) dropRamp = 0;
		else if (dropRamp > 1) dropRamp = 1;
		const dropTarget = this._dropLimiter
			? this.dropMinV + (this.dropMaxV - this.dropMinV) * dropRamp
			: this.velDropV;
		this.dropEff = this.glide(
			this.dropGl,
			dropTarget,
			this._dropGlide,
			this.dropAtkV,
			this.dropRelV,
			dtMs,
			false,
		);

		// targetDamp = raw product (tgtDamp bar); damp = glided product (applied).
		let targetDamp = 1,
			damp = 1;
		if (this._accelLimiter) {
			targetDamp *= accDamp;
			damp *= accG;
		}
		if (this._absJerkLimiter) {
			targetDamp *= aJerkDamp;
			damp *= aJerkG;
		}
		if (this._decelLimiter) {
			targetDamp *= decelDamp;
			damp *= decelG;
		}
		if (this._angAccelLimiter) {
			targetDamp *= angAccDamp;
			damp *= angAccG;
		}
		predAngle *= damp;
		// console.log(
		// 	accDamp,
		// 	aJerkDamp,
		// 	decelDamp,
		// 	angAccDamp,
		// 	targetDamp,
		// 	damp,
		// 	predAngle,
		// );

		// Target the prediction when on (Demo and Predicted); otherwise the raw reading.
		// console.log(this.measVec, this.angAxis, predAngle);
		const target = this._prediction
			? this.rotateAround(this.measVec, this.angAxis, predAngle)
			: this.measVec;

		// Inertial settle -- one of three selectable algorithms (settleMode):
		//  - "velocity": settle off (inertia=false) -> the easing path in the final else.
		//  - "spring": the main branch's speed-gated spring (below).
		//  - "comoving" (default): velocity-coupled spring on a CO-MOVING setpoint --
		//    while a movement builds/holds (FAST) `cur` is PACED by the angular velocity
		//    (rotated by angSpeed*dt). The strong spring chases a setpoint seeded to
		//    `cur` at the SLOW->FAST edge and advanced by the same motion, with the lead
		//    grown in from 0 by accumulated rotation, so there's no onset step/snap; a
		//    weak anchor reels `cur` onto truth. When the detector flips SLOW the follow
		//    freezes and `cur` settles under the anchor instead of chasing the reading.
		let driveDbg = 1,
			velDbg = 0,
			peakDbg = 0;
		if (this._inertia && this._prediction && this._settleMode === "spring") {
			// Spring inertial settle: a speed-gated strong spring tracks the
			// absolute led `target` while moving; as measured speed -> 0 the drive fades
			// and `cur` coasts to rest under constant damping. A weak anchor kills drift.
			// No velocity-follow and no FAST/SLOW gate -- its own independent variables.
			let drive = this.angSpeed / this.springSpeedV; // 1 while moving -> 0 at rest
			if (drive > 1) drive = 1;
			else if (drive < 0) drive = 0;
			driveDbg = drive;
			velDbg = this.detVel;
			peakDbg = this.velPeak;
			const kTrack = this.springTrackV * drive;
			for (let i = 0; i < 3; i++) {
				const accel =
					kTrack * (target[i] - this.cur[i]) +
					this.springAnchorV * (this.measVec[i] - this.cur[i]) -
					this.springDampV * this.curVel[i];
				this.curVel[i] += accel * frameDt;
				this.cur[i] += this.curVel[i] * frameDt;
			}
		} else if (this._inertia && this._prediction) {
			driveDbg = this.settleFast ? 1 : 0;
			velDbg = this.detVel;
			peakDbg = this.velPeak;

			if (this.settleFast) {
				if (!this.wasFast) {
					this.springBase = this.cur.slice();
					this.leadAcc = 0;
				} // snapshot at onset
				// Advance the setpoint base with the motion, then bleed the onset gap
				// (meas - base) toward truth so it can't accumulate over a long sweep.
				// Skip the bleed on the onset frame -- otherwise it would overwrite the
				// springBase = cur snapshot above and snap cur to raw on a SLOW->FAST flip.
				this.springBase = this.rotateAround(
					this.springBase,
					this.angAxis,
					this.angSpeed * frameDt,
				);
				if (this.wasFast)
					for (let i = 0; i < 3; i++)
						this.springBase[i] +=
							(this.measVec[i] - this.springBase[i]) * this.baseTrackV;
				// Grow the lead at the motion's own rate (scaled by `leadrt`) until it
				// reaches the limited predAngle: leadAcc is the rotation accumulated since
				// onset, capped at the full lead. So the lead emerges from motion, no step.
				this.leadAcc += this.angSpeed * this.leadRateV * frameDt;
				if (Math.abs(this.leadAcc) > Math.abs(predAngle))
					this.leadAcc = predAngle;
				if (predAngle === 0) this.leadAcc = 0;
				this.cur = this.rotateAround(
					this.cur,
					this.angAxis,
					this.angSpeed * frameDt,
				); // velocity-follow
			} else if (this.wasFast) {
				// Entering SLOW: shed most of the momentum the spring built (so it can't
				// fling the dot far past truth), but keep a little (`coast`) so the dot
				// glides gently through before the weak anchor settles it onto truth.
				this.curVel[0] *= this.coastV;
				this.curVel[1] *= this.coastV;
				this.curVel[2] *= this.coastV;
			}
			this.wasFast = this.settleFast;

			// The velocity-paced, lead-grown setpoint (no onset step -> no snap).
			const moving = this.rotateAround(
				this.springBase,
				this.angAxis,
				this.leadAcc,
			);

			// Spring settle. FAST: the strong spring pulls cur toward the co-moving
			// `moving` setpoint for springy, lead-carrying tracking. SLOW: the strong
			// term is gated OFF, so only the weak `anchor` toward raw truth is left and
			// cur settles to rest under it. Damping is derived from whichever stiffness
			// is active, so the damping ratio stays `zeta`. Semi-implicit Euler.
			const kStrong = this.settleFast ? this.springStiffV : 0;
			const c = 2 * Math.sqrt(kStrong + this.anchorV) * this.springZetaV;
			for (let i = 0; i < 3; i++) {
				const accel =
					kStrong * (moving[i] - this.cur[i]) +
					this.anchorV * (this.measVec[i] - this.cur[i]) -
					c * this.curVel[i];
				this.curVel[i] += accel * frameDt;
				this.cur[i] += this.curVel[i] * frameDt;
			}
		} else {
			// Velocity easing path (prediction off, or inertial settle disabled).
			// Ease toward the target; snap (kSmooth = 1) if smoothing is off or when
			// prediction is off, so Raw Sensor mode tracks the raw reading exactly.
			let kSmooth = this.curSmoothV;
			if (!this._prediction || !this._smoothing) kSmooth = 1;
			this.cur[0] += (target[0] - this.cur[0]) * kSmooth;
			this.cur[1] += (target[1] - this.cur[1]) * kSmooth;
			this.cur[2] += (target[2] - this.cur[2]) * kSmooth;
		}

		// Debug read-backs (plain object writes, no DOM). The overlay itself is
		// drawn in renderFrame() only when debug is on.
		this.dbg.damp = damp;
		this.dbg.targetDamp = targetDamp;
		this.dbg.accDamp = accDamp;
		this.dbg.aJerkDamp = aJerkDamp;
		this.dbg.decelDamp = decelDamp;
		this.dbg.drive = driveDbg;
		this.dbg.vel = velDbg;
		this.dbg.peak = peakDbg;
		this.dbg.predAngle = predAngle;
		return this.cur;
	}

	update(ts) {
		const now = ts || performance.now();
		// Clamp dt so a frame-rate hitch can't push the explicit integrators past
		// their stability bound (damp < 2/dt). At <=45fps-equiv we just advance a
		// bit less than real time for that frame - imperceptible, keeps tuning safe.
		const realDt = this.lastFrameTime
			? (now - this.lastFrameTime) / 1000
			: 1 / 60;
		let frameDt = realDt;
		if (frameDt > 1 / 45) frameDt = 1 / 45;
		this.lastFrameTime = now;
		// Always-on fps (from the unclamped delta, so it can read below 45). Smoothed,
		// shown in the Debug label; throttled so it isn't relaid out every frame.
		if (realDt > 0) this.dbg.fps += (1 / realDt - this.dbg.fps) * 0.1;
		this.stepPrediction(now, frameDt);
		if (this.debugOn) {
			this.updateDebug();
		}
	}

	constructor() {
		document
			.getElementById("testClose")
			.addEventListener("click", () => this.testModal.classList.add("hidden"));
		this.testModal.addEventListener("click", (e) => {
			if (e.target === this.testModal) this.testModal.classList.add("hidden");
		});

		this.recSaveBtn.addEventListener("click", this.saveRecording);
		this.recLoadBtn.addEventListener("click", () => this.recFileInput.click());
		this.recFileInput.addEventListener("change", () => {
			if (this.recFileInput.files && this.recFileInput.files[0])
				this.loadRecording(this.recFileInput.files[0]);
			this.recFileInput.value = ""; // allow re-loading the same file
		});
		this.recRecordBtn.addEventListener("click", () => {
			this.recording ? this.stopRecording() : this.startRecording(false);
		});
		this.recPlayBtn.addEventListener("click", () => {
			this.playing ? this.stopPlayback() : this.startPlayback();
		});
		this.recTestsBtn.addEventListener("click", () => {
			this.recording ? this.stopRecording() : this.startRecording(true);
		});
		this.recVerifyBtn.addEventListener("click", () => this.verifyTests());
		this.updateRecUI();
		this.buildDebug();
	}
}

export const Shimmery = ShimmeryClass;
