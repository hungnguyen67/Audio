import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
import sys

from app.core.config import ROOT


class _TeeStream:
    def __init__(self, console, handler, level):
        self.console = console
        self.handler = handler
        self.level = level
        self.encoding = getattr(console, "encoding", "utf-8")
        self.errors = "backslashreplace"

    def write(self, message):
        self.console.write(message)
        if message.strip():
            record = logging.LogRecord(
                "audio",
                self.level,
                "",
                0,
                message.rstrip(),
                (),
                None,
            )
            self.handler.emit(record)
        return len(message)

    def flush(self):
        self.console.flush()
        self.handler.flush()

    def isatty(self):
        return self.console.isatty()

    def fileno(self):
        return self.console.fileno()


def configure_console_encoding():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(errors="backslashreplace")

    log_directory = ROOT / "backend" / "logs"
    log_directory.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_directory / "backend.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
        errors="backslashreplace",
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))

    sys.stdout = _TeeStream(sys.stdout, handler, logging.INFO)
    sys.stderr = _TeeStream(sys.stderr, handler, logging.ERROR)
