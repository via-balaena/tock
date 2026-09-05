---
driver number: 0x00011
---

# Stepper

## Overview

The stepper driver turns a four-phase unipolar stepper motor, of the kind a
28BYJ-48 with a ULN2003 board presents. An application asks for a number of
steps at an interval; the kernel advances the phase sequence from its own alarm
and reports completion.

The application does not name pins and does not time the steps. Which four pins
are the phase windings is a board decision, set in the board's main file, as it
is for LEDs and buttons.

Timing the steps in the kernel rather than in userspace is deliberate. It keeps
the syscall round trip out of the step interval, so the achievable step rate is
a property of the alarm and the motor rather than of syscall overhead. More
importantly, it means the kernel holds a periodic callback for the duration of
a run, and can therefore notice that the process which started the run has
exited or faulted. When it notices, it drives all four windings low and stops.
A coil left energised draws current and heats the motor, and nothing else in
the system would release it — the GPIO driver deliberately offers "hardware-like"
control with no ownership to unwind, so a motor driven directly through it stays
energised for the life of the board if its process dies mid-step.

One process at a time may drive the motor. A process attempting to start a run
while one is in progress receives `BUSY`, and that includes the process that
already owns it: **a step command never replaces a movement in progress.** An
owner wanting to change direction or distance must issue command 3 first, which
ends the current movement and reports how far it got. The one exception is an
owner that has exited — the motor is then released and the next caller takes
it.

A step is one entry in an eight-entry half-step sequence. A caller wanting full
steps takes two. With a 28BYJ-48's 64:1 gearbox this is 4096 steps per output
revolution.

## Command

  * ### Command number: `0`

    **Description**: Existence check.

    **Argument 1**: Unused

    **Argument 2**: Unused

    **Returns**: `Ok(())` if the driver is present.

  * ### Command number: `1`

    **Description**: Step forward. Advances the phase sequence by the requested
    number of steps, waiting the given interval between each. Returns
    immediately; completion arrives as an upcall.

    **Argument 1**: Number of steps.

    **Argument 2**: Interval between steps, in microseconds.

    **Returns**: `Ok(())` if the run started. `INVAL` if either argument is
    zero, or if the interval does not fit in 32 bits. `BUSY` if another live
    process is currently stepping.

  * ### Command number: `2`

    **Description**: Step in reverse. Identical to command 1 but advances the
    sequence in the opposite direction.

    **Argument 1**: Number of steps.

    **Argument 2**: Interval between steps, in microseconds.

    **Returns**: As command 1.

  * ### Command number: `3`

    **Description**: Stop. Ends any run this process owns, drives all four
    windings low and releases the motor. For an open-loop motor the number of
    steps actually taken is the only record of where it ended up, so it is
    reported twice: returned to this caller, and carried by the completion
    upcall.

    Both, rather than either, because the two reach different callers. The
    upcall is the run's completion, and a caller waiting on it needs the stop
    to provoke it or the wait never ends. The return value is for whoever
    calls stop, who may not hold the subscription — and a caller that wrapped
    the run in something like a `select` may already have dropped the machinery
    the upcall would arrive through.

    **Argument 1**: Unused

    **Argument 2**: Unused

    **Returns**: The number of steps taken, if the caller owned the motor and
    it was stopped. `RESERVE` if the caller does not own it — a caller trying
    to stop a motor held by another process must be able to tell that it did
    not stop.

## Subscribe

  * ### Subscribe number: `0`

    **Description**: Completion callback, delivered when a run ends, whether it
    finished on its own or was stopped by command 3. A run ended because the
    owning process exited delivers nothing, there being nobody left to tell;
    the windings are still driven low.

    **Callback signature**: The first argument is a status code, the second the
    number of steps actually taken. A run that was stopped early reports
    success with a count lower than requested: fewer steps than asked for is
    not a failure, and the count is the payload.

    **Returns**: `Ok(())`.

## Allow

Unused.

## Note on holding position

The windings are de-energised when a run completes. Holding position against a
load requires a coil to stay energised, which this driver does not currently
offer; the safe state is the default, and a hold command can be added without
changing the behaviour callers already rely on. A geared motor such as the
28BYJ-48 holds against gravity unpowered in most orientations.
