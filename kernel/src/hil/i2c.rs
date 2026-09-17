// Licensed under the Apache License, Version 2.0 or the MIT License.
// SPDX-License-Identifier: Apache-2.0 OR MIT
// Copyright Tock Contributors 2022.

//! Interface for I2C master and slave peripherals.

use crate::ErrorCode;

use core::fmt;
use core::fmt::{Display, Formatter};

/// The type of error encountered during I2C communication.
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Error {
    /// The slave did not acknowledge the chip address. Most likely the address
    /// is incorrect or the slave is not properly connected.
    AddressNak,

    /// The data was not acknowledged by the slave.
    DataNak,

    /// Arbitration lost, meaning the state of the data line does not correspond
    /// to the data driven onto it. This can happen, for example, when a
    /// higher-priority transmission is in progress by a different master.
    ArbitrationLost,

    /// A start condition was received before received data has been read
    /// from the receive register.
    Overrun,

    /// A length argument is larger than the buffer it indexes.
    ///
    /// A fault in the call, not on the bus: nothing was transmitted, and
    /// retrying without changing the length will fail the same way. Distinct
    /// from [`Error::Overrun`], which is a receive register overflowing
    /// during a transfer that did start.
    Size,

    /// The requested operation wasn't supported.
    NotSupported,

    /// The underlying device has another request in progress
    Busy,
}

impl From<Error> for ErrorCode {
    fn from(val: Error) -> Self {
        match val {
            Error::AddressNak | Error::DataNak => ErrorCode::NOACK,
            Error::ArbitrationLost => ErrorCode::RESERVE,
            Error::Overrun | Error::Size => ErrorCode::SIZE,
            Error::NotSupported => ErrorCode::NOSUPPORT,
            Error::Busy => ErrorCode::BUSY,
        }
    }
}

impl Display for Error {
    fn fmt(&self, fmt: &mut Formatter) -> fmt::Result {
        let display_str = match *self {
            Error::AddressNak => "I2C Address Not Acknowledged",
            Error::DataNak => "I2C Data Not Acknowledged",
            Error::ArbitrationLost => "I2C Bus Arbitration Lost",
            Error::Overrun => "I2C receive overrun",
            Error::Size => "I2C length is larger than the buffer",
            Error::NotSupported => "I2C/SMBus command not supported",
            Error::Busy => "I2C/SMBus is busy",
        };
        write!(fmt, "{}", display_str)
    }
}

/// This specifies what type of transmission just finished from a Master device.
#[derive(Copy, Clone, Debug)]
pub enum SlaveTransmissionType {
    Write,
    Read,
}

/// Interface for an I2C Master hardware driver.
///
/// # The transfer contract
///
/// [`I2CMaster::write_read`], [`I2CMaster::write`] and [`I2CMaster::read`] are
/// asynchronous and share one contract.
///
/// On `Ok(())` the transfer has started and
/// [`I2CHwMasterClient::command_complete`] will be called once with the
/// buffer. On `Err((error, buffer))` the transfer did not start, the buffer
/// comes back inside the error, and **there will be no callback** -- the
/// caller owns the buffer again as soon as the call returns.
///
/// Every implementation may return these, and no others:
///
/// - [`Error::Busy`]: a transfer is already outstanding. An implementation
///   MUST refuse rather than accept: it holds one buffer, so starting a
///   second transfer loses the first buffer and the callback that would have
///   returned it.
/// - [`Error::Size`]: a length argument is larger than the buffer it indexes.
///   MUST be checked before the buffer is handed to the hardware. Two of
///   these drivers program a DMA engine with the length, where a length past
///   the buffer is read or written outside anything Rust can see.
/// - [`Error::NotSupported`]: this hardware cannot do the operation at all --
///   a controller with no DMA where the driver needs it, or one that has not
///   been enabled.
///
/// Errors detected once the transfer is under way -- [`Error::AddressNak`],
/// [`Error::DataNak`], [`Error::ArbitrationLost`], [`Error::Overrun`] --
/// arrive in the callback, not here.
pub trait I2CMaster<'a> {
    /// Set the client that receives every [`I2CHwMasterClient::command_complete`].
    fn set_master_client(&self, master_client: &'a dyn I2CHwMasterClient);

    /// Enable the hardware. A transfer started while disabled may return
    /// [`Error::NotSupported`].
    fn enable(&self);

    /// Disable the hardware, releasing whatever power or clock it holds.
    fn disable(&self);

    /// Write `write_len` bytes from `data` to `addr`, then read `read_len`
    /// bytes back into `data` starting at index 0, with a repeated start
    /// between the two.
    ///
    /// Both lengths index `data`, so both must be no larger than it; the read
    /// overwrites the bytes just written. See the trait documentation for what
    /// the return values mean.
    fn write_read(
        &self,
        addr: u8,
        data: &'static mut [u8],
        write_len: usize,
        read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Write `len` bytes from `data` to `addr`.
    ///
    /// See the trait documentation for what the return values mean.
    fn write(
        &self,
        addr: u8,
        data: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Read `len` bytes from `addr` into `buffer`.
    ///
    /// See the trait documentation for what the return values mean.
    fn read(
        &self,
        addr: u8,
        buffer: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
}

/// Interface for an SMBus Master hardware driver.
/// The device implementing this will also separately implement
/// I2CMaster.
/// SMBus variants of the master operations.
///
/// The return values mean exactly what [`I2CMaster`]'s do -- same `Ok(())`
/// promise of one callback, same `Err((error, buffer))` giving the buffer
/// back with no callback, same three errors. See that trait rather than
/// repeating them here.
///
/// What differs is on the wire, not in the signature: these make whatever
/// hardware changes SMBus needs and revert them afterwards, as a best effort
/// against what the controller can actually do. One in-tree implementer,
/// `apollo3`.
pub trait SMBusMaster<'a>: I2CMaster<'a> {
    /// Write data then read data via the I2C Master device in an SMBus
    /// compatible way.
    ///
    /// This function will use the I2C master to write data to a device and
    /// then read data from the device in a SMBus compatible way. This will be
    /// a best effort attempt to match the SMBus specification based on what
    /// the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// addr: The address of the device to write to
    /// data: The buffer to write the data from and read back to
    /// write_len: The length of the write operation
    /// read_len: The length of the read operation
    fn smbus_write_read(
        &self,
        addr: u8,
        data: &'static mut [u8],
        write_len: usize,
        read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Write data via the I2C Master device in an SMBus compatible way.
    ///
    /// This function will use the I2C master to write data to a device in a
    /// SMBus compatible way. This will be a best effort attempt to match the
    /// SMBus specification based on what the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// addr: The address of the device to write to
    /// data: The buffer to write the data from
    /// len: The length of the operation
    fn smbus_write(
        &self,
        addr: u8,
        data: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Read data via the I2C Master device in an SMBus compatible way.
    ///
    /// This function will use the I2C master to read data from a device in a
    /// SMBus compatible way. This will be a best effort attempt to match the
    /// SMBus specification based on what the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// addr: The address of the device to read from
    /// buffer: The buffer to store the data to
    /// len: The length of the operation
    fn smbus_read(
        &self,
        addr: u8,
        buffer: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
}

/// Interface for an I2C Slave hardware driver.
/// Interface for an I2C Slave hardware driver.
///
/// # The slave contract
///
/// [`I2CSlave::write_receive`] and [`I2CSlave::read_send`] are asynchronous
/// and share the shape [`I2CMaster`] uses: on `Ok(())` the hardware is armed
/// and an [`I2CHwSlaveClient`] callback will follow with the buffer; on
/// `Err((error, buffer))` nothing was armed, the buffer comes back inside the
/// error, and **there will be no callback**.
///
/// `max_len` indexes `data` and so must be no larger than it, exactly as the
/// lengths do on the master side, and for the same reason: an implementation
/// may hand that number to a DMA engine, where a length past the buffer is
/// read or written outside anything Rust can see. `nrf52` writes it straight
/// into `MAXCNT`.
///
/// - [`Error::Size`]: `max_len` is larger than `data`. MUST be checked before
///   the buffer reaches the hardware.
/// - [`Error::Busy`]: the hardware is already armed or a transfer is
///   outstanding.
/// - [`Error::NotSupported`]: this controller has no slave mode, or has not
///   been enabled.
///
/// Errors detected once a master has started talking to us arrive in the
/// client callback, not here.
///
/// # No implementation returns any of them today
///
/// Both in-tree slave drivers -- `sam4l` and `nrf52` -- answer `Ok(())`
/// unconditionally from all three fallible methods, so the `Result` is
/// currently decorative and **the `Size` check above is performed by neither**.
/// It is stated anyway: it is the rule the master half of this same HIL
/// already states and enforces, and a caller has no way to discover that its
/// length was not checked.
///
/// What keeps the tree safe meanwhile is arithmetic in the one caller rather
/// than a check in the drivers. `i2c_master_slave_driver` arms receives with a
/// length one byte shorter than its own buffer and clamps sends to the
/// smaller of the app's buffer and its own.
pub trait I2CSlave<'a> {
    fn set_slave_client(&self, slave_client: &'a dyn I2CHwSlaveClient);
    fn enable(&self);
    fn disable(&self);
    fn set_address(&self, addr: u8) -> Result<(), Error>;
    fn write_receive(
        &self,
        data: &'static mut [u8],
        max_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
    fn read_send(
        &self,
        data: &'static mut [u8],
        max_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
    fn listen(&self);
}

/// Convenience type for capsules that need hardware that supports both
/// Master and Slave modes.
/// A controller that can be both master and slave.
///
/// A marker with no methods of its own: both contracts apply unchanged, and
/// which one is in force is whichever call was made.
pub trait I2CMasterSlave<'a>: I2CMaster<'a> + I2CSlave<'a> {}
// Provide blanket implementations for trait group
// impl<T: I2CMaster + I2CSlave> I2CMasterSlave for T {}

/// Client interface for capsules that use I2CMaster devices.
pub trait I2CHwMasterClient {
    /// Called when an I2C command completed.
    ///
    /// `buffer` is always the buffer passed to the call that started the
    /// transfer, whatever `status` says -- this is the only way it comes back
    /// once a call has returned `Ok(())`.
    ///
    /// `status` is `Ok(())` if the transfer completed, or the [`Error`] that
    /// ended it. The length is not reported: a transfer that did not move
    /// every byte it was given is an error, not a short success.
    fn command_complete(&self, buffer: &'static mut [u8], status: Result<(), Error>);
}

/// Client interface for capsules that use I2CSlave devices.
pub trait I2CHwSlaveClient {
    /// Called when an I2C command completed.
    fn command_complete(
        &self,
        buffer: &'static mut [u8],
        length: usize,
        transmission_type: SlaveTransmissionType,
    );

    /// Called from the I2C slave hardware to say that a Master has sent us
    /// a read message, but the driver did not have a buffer containing data
    /// setup, and therefore cannot respond. The I2C slave hardware will stretch
    /// the clock while waiting for the upper layer capsule to provide data
    /// to send to the remote master. Call `I2CSlave::read_send()` to provide
    /// data.
    fn read_expected(&self);

    /// Called from the I2C slave hardware to say that a Master has sent us
    /// a write message, but there was no buffer setup to read the bytes into.
    /// The HW will stretch the clock while waiting for the user to call
    /// `I2CSlave::write_receive()` with a buffer.
    fn write_expected(&self);
}

/// Higher-level interface for I2C Master commands that wraps in the I2C
/// address. It gives an interface for communicating with a specific I2C
/// device.
///
/// The transfer contract is [`I2CMaster`]'s, with the address already bound:
/// `Ok(())` promises one [`I2CClient::command_complete`], `Err` returns the
/// buffer and promises no callback, and the same three errors may be
/// returned. A virtualized device adds no new ones -- a second transfer on a
/// device that already has one outstanding is [`Error::Busy`], the same as it
/// is on the hardware underneath.
pub trait I2CDevice {
    fn enable(&self);
    fn disable(&self);
    fn write_read(
        &self,
        data: &'static mut [u8],
        write_len: usize,
        read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
    fn write(&self, data: &'static mut [u8], len: usize) -> Result<(), (Error, &'static mut [u8])>;
    fn read(&self, buffer: &'static mut [u8], len: usize)
    -> Result<(), (Error, &'static mut [u8])>;
}

/// SMBus variants of the per-device operations.
///
/// The return values mean exactly what [`I2CDevice`]'s do; see that trait.
/// As with [`SMBusMaster`], what differs is the bus behaviour rather than the
/// contract.
pub trait SMBusDevice: I2CDevice {
    /// Write data then read data to a slave device in an SMBus
    /// compatible way.
    ///
    /// This function will use the I2C master to write data to a device and
    /// then read data from the device in a SMBus compatible way. This will be
    /// a best effort attempt to match the SMBus specification based on what
    /// the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// data: The buffer to write the data from and read back to
    /// write_len: The length of the write operation
    /// read_len: The length of the read operation
    fn smbus_write_read(
        &self,
        data: &'static mut [u8],
        write_len: usize,
        read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Write data to a slave device in an SMBus compatible way.
    ///
    /// This function will use the I2C master to write data to a device in a
    /// SMBus compatible way. This will be a best effort attempt to match the
    /// SMBus specification based on what the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// data: The buffer to write the data from
    /// len: The length of the operation
    fn smbus_write(
        &self,
        data: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;

    /// Read data from a slave device in an SMBus compatible way.
    ///
    /// This function will use the I2C master to read data from a device in a
    /// SMBus compatible way. This will be a best effort attempt to match the
    /// SMBus specification based on what the hardware can support.
    /// This function is expected to make any hardware changes required to
    /// support SMBus and then revert those changes to support future I2C.
    ///
    /// buffer: The buffer to store the data to
    /// len: The length of the operation
    fn smbus_read(
        &self,
        buffer: &'static mut [u8],
        len: usize,
    ) -> Result<(), (Error, &'static mut [u8])>;
}

/// Client interface for I2CDevice implementations.
pub trait I2CClient {
    /// Called when an I2C command completed. The `error` denotes whether the command completed
    /// successfully or if an error occured.
    fn command_complete(&self, buffer: &'static mut [u8], status: Result<(), Error>);
}

pub struct NoSMBus;

impl<'a> I2CMaster<'a> for NoSMBus {
    fn set_master_client(&self, _master_client: &'a dyn I2CHwMasterClient) {}
    fn enable(&self) {}
    fn disable(&self) {}
    fn write_read(
        &self,
        _addr: u8,
        data: &'static mut [u8],
        _write_len: usize,
        _read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, data))
    }
    fn write(
        &self,
        _addr: u8,
        data: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, data))
    }
    fn read(
        &self,
        _addr: u8,
        buffer: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, buffer))
    }
}

impl SMBusMaster<'_> for NoSMBus {
    fn smbus_write_read(
        &self,
        _addr: u8,
        data: &'static mut [u8],
        _write_len: usize,
        _read_len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, data))
    }

    fn smbus_write(
        &self,
        _addr: u8,
        data: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, data))
    }

    fn smbus_read(
        &self,
        _addr: u8,
        buffer: &'static mut [u8],
        _len: usize,
    ) -> Result<(), (Error, &'static mut [u8])> {
        Err((Error::NotSupported, buffer))
    }
}
