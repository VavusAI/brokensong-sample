# BROKENSONG online edition: working sample

A working sample prepared by DCI Brands LLC for Maynooth University's tender PCO 543 ("Open Competition for the Brokensong Web Page creation"). It shows how the proposed online edition works. **It is not the BROKENSONG project's website, is not affiliated with the project, and contains no project data.**

Live: https://vavusai.github.io/brokensong-sample/

## How it works
A static site, as the edition would be on GitHub Pages: `build/build.py` reads MEI encodings and DIAMM source records (DIAMM public API) and writes JSON indexes; the browser does the rest. Music is engraved by Verovio from MEI, manuscript images open in Mirador from IIIF servers, and browse, filters and search (accent- and u/v, i/j-insensitive) run from the prebuilt indexes. One passage is encoded as an editorial reconstruction (MEI `<supplied>`) to show how reconstructed material is displayed, and one piece can be switched to its original black mensural notation, as separate parts or with the voices aligned by Verovio.

Each piece also has: playback in the browser (Verovio timing at the encoders' tempo, a recorded choir sound per note, the sounding notes highlighted in the score, voices switchable, speed control); the editors' commentary from the MEI header, with bar numbers that open the bar in the edition; and downloads as PDF score, MIDI and MEI. `build/make_pdfs.py` prints `print.html` for every piece to `data/pdf/` with Google Chrome (Playwright).

## Credits and licences
- Music encodings: *Measuring Polyphony: Digital Encodings of Late Medieval Music*, ed. Karen Desmond (measuringpolyphony.org), CC BY 3.0. Three files with malformed attributes were repaired by the build step; the tenor of *Li dous maus* (Mo, f. 349v), bars 5-12, is marked as reconstructed for demonstration only.
- Original-notation excerpt of *De touz*: mei-friend mensural skeleton example encoding, CC0 1.0.
- Source descriptions: DIAMM (Digital Image Archive of Medieval Music), via its public API.
- Manuscript images are loaded live from the holding institutions' IIIF servers (IRHT Bibliothèque virtuelle des manuscrits médiévaux for Montpellier H 196; Cambridge University Library) and are not stored here.
- Home page picture: London, British Library, Harley MS 978, f. 11v (*Sumer is icumen in*), public domain (CC0), via Wikimedia Commons.
- Choir sound (`assets/sound/choir/`, one file per pitch, MIDI 36-84): FluidR3 GM soundfont by Frank Wen, CC BY 3.0, as rendered by gleitz/midi-js-soundfonts.
- Verovio (LGPL-3.0) and Mirador (Apache-2.0) are loaded from jsDelivr.
- Site code (HTML, CSS, JavaScript, build script): MIT licence, © 2026 DCI Brands LLC.
