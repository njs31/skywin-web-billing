/*
 * libusb is reached through a bridging header rather than a module map so the
 * whole app builds with a bare `swiftc` invocation — this Mac has the Command
 * Line Tools but no Xcode, so there is no project file to hang a module on.
 */
#include <libusb-1.0/libusb.h>
