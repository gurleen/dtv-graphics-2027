"""Stands in for a serial port: makes a pseudo-terminal, prints the slave's path, and writes each hex line from stdin to it."""
import os
import sys
import tty

master, slave = os.openpty()
tty.setraw(slave)
print(os.ttyname(slave), flush=True)
for line in sys.stdin:
    os.write(master, bytes.fromhex(line.strip()))
