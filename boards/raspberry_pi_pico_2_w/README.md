Raspberry Pi Pico 2 W - RP2350
==============================

The [Raspberry Pi Pico 2 W](https://www.raspberrypi.com/products/raspberry-pi-pico-2/)
is a board developed by the Raspberry Pi Foundation. It is a Raspberry Pi
Pico 2, based on the RP2350 chip, with an Infineon CYW43439 radio module added.

To get started, follow the [Raspberry Pi Pico 2 guide](../raspberry_pi_pico_2/README.md).
Building, flashing over SWD or BOOTSEL, and the serial console all work the
same way here, and this board reuses that board's Makefile.

## Differences from the Raspberry Pi Pico 2

**There is no user LED.** On a Pico 2, GPIO 25 drives the LED. On a Pico 2 W
that pin is the radio's SPI chip select, and the LED is on the radio module
instead. The pico-sdk board header says the same thing by leaving
`PICO_DEFAULT_LED_PIN` undefined, with the comment "no PICO_DEFAULT_LED_PIN,
LED is on Wireless chip".

So this board instantiates no LED capsule. Applications that use the LED
syscall driver get `NODEVICE` back, including the `blink` examples in
libtock-c and libtock-rs. The GPIO driver is unaffected, so an LED wired to a
header pin still works.

For the same reason the panic handler prints the panic message over the
console and halts, where the Pico 2 blinks GPIO 25.

**Four pins reach the radio and are not on the header.** GP23 is the radio's
power enable, GP24 its data line, GP25 its chip select, and GP29 its clock.
GP23, GP24 and GP29 are currently exposed through the GPIO driver, so an
application that drives them can power up or confuse the radio.

**Wi-Fi works.** The CYW43439 is reached the same way `raspberry_pi_pico_w`
reaches the same part: a half duplex SPI bit banged by a PIO state machine with
DMA feeding the FIFOs. The driver, the transport and the firmware blobs are all
shared with that board.

Verified on hardware: the radio initialises, reports its MAC address from OTP,
enters station mode and completes a scan.
