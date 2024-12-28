- [ ] Graphics card settings 
- [ ] Thumbnail for running VM if available
    - [ ] Fetch every 10 seconds using whatever method is available
    - [ ] If headless is enabled, generate an image of the serial console
- [ ] In-browser Remote Desktop
    - [ ] SPICE support for better performance
    - [ ] Game Controller support, via mapping mouse and keyboard and via direct gamepad passthrough
    - [ ] Audio support (either direct from SPICE or some hacky way for VNC?)
    - [ ] USB support (maybe?)

# Bug fixes
- [ ] File browser not opening on new VM
- [ ] No file browser button for disks when editing a VM
- [x] Can't disable KVM if it's enabled but not available (because it's disabled)
- [x] KVM should not be selected by default if it's not available (new VM)
- [x] Relative mouse movement isn't working
