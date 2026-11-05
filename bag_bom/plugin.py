"""Small SWIG action plugin; camera/OCR run in the user's browser."""

from pathlib import Path
import webbrowser

import pcbnew
import wx

from .server import BomSession

_sessions = []


class BagBomPlugin(pcbnew.ActionPlugin):
    def defaults(self):
        self.name = "Bag BOM — scan component labels"
        self.category = "Assembly"
        self.description = "Open an InteractiveHtmlBom export with offline webcam label matching"
        self.show_toolbar_button = True
        self.icon_file_name = str(Path(__file__).parent / "icon.png")

    def Run(self):
        board = pcbnew.GetBoard()
        filename = board.GetFileName() if board else ""
        directory = Path(filename).parent if filename else Path.home()
        if (directory / "bom").is_dir():
            directory /= "bom"
        with wx.FileDialog(
            None, "Bag BOM: choose your InteractiveHtmlBom export",
            defaultDir=str(directory), defaultFile="ibom.html",
            wildcard="InteractiveHtmlBom (*.html;*.htm)|*.html;*.htm",
            style=wx.FD_OPEN | wx.FD_FILE_MUST_EXIST,
        ) as dialog:
            if dialog.ShowModal() != wx.ID_OK:
                return
            try:
                session = BomSession(dialog.GetPath()).start()
                _sessions[:] = [s for s in _sessions if s.running]
                _sessions.append(session)
                webbrowser.open(session.url)
            except (OSError, ValueError) as exc:
                wx.MessageBox(str(exc), "Bag BOM", wx.OK | wx.ICON_ERROR)
