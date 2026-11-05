"""Bag BOM can also run outside KiCad: python -m bag_bom path/to/ibom.html."""

import os
import sys

if sys.argv[0] != '-m' and not os.environ.get('BAG_BOM_CLI_MODE'):
    try:
        import pcbnew
        import wx
    except ImportError:
        pass
    else:
        # Importing from KiCad's standalone Python must not call into its GUI.
        if wx.GetApp() is not None:
            from .plugin import BagBomPlugin

            BagBomPlugin().register()
