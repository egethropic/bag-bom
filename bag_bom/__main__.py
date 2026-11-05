import argparse
import threading
import webbrowser

from .server import BomSession


def main():
    parser = argparse.ArgumentParser(description="Open an InteractiveHtmlBom with offline bag-label scanning.")
    parser.add_argument("html", help="An existing InteractiveHtmlBom HTML export")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    with BomSession(args.html) as session:
        print(session.url, flush=True)
        if not args.no_browser:
            webbrowser.open(session.url)
        try:
            while session.running:
                threading.Event().wait(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
