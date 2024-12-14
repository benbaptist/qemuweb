- [x] Setting manual VNC port doesn't work
- [ ] Remote display support thru browser
- [x] Move "create VM" button to the right of the "Virtual machines" header
- [ ] Thumbnail for running VM if available
    - [ ] Fetch every 10 seconds using whatever method is available
    - [ ] If headless is enabled, generate an image of the serial console
- [ ] Once remote desktop is implemented
    - [ ] Game Controller support, via mapping mouse and keyboard and via direct gamepad passthrough
    - [ ] Audio support (either direct from SPICE or some hacky way for VNC?)
    - [ ] USB support (maybe?)


# Bug fixes
- [ ] Ctrl+C on the server process doesn't stop all VMs prior to exiting
- [x] Ctrl+C spews errors to the console
- [ ] When VNC port is already in use, VM fails to start instead of dynamically selecting a new port