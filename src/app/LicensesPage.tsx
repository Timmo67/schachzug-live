import { fileUrl } from '../lib/native';

/** Open-source licences of the software Knightcall ships, incl. the GPLv3 notice for Stockfish. */
export function LicensesPage() {
  return (
    <div className="panel legal">
      <h1>Lizenzen</h1>
      <h2>Stockfish (Partieanalyse)</h2>
      <p>Die Partieanalyse nutzt die Schach-Engine <b>Stockfish 18</b> in der WebAssembly-Fassung <b>Stockfish.js</b> (© The Stockfish developers, © Chess.com, LLC). Sie läuft als eigenständiges Programm auf deinem Gerät und steht unter der <b>GNU General Public License, Version 3</b>.</p>
      <ul>
        <li>Lizenztext: <a href={fileUrl('/engine/COPYING.txt')} target="_blank" rel="noreferrer">GPLv3</a></li>
        <li>Quellcode Stockfish: <a href="https://github.com/official-stockfish/Stockfish" target="_blank" rel="noreferrer">github.com/official-stockfish/Stockfish</a></li>
        <li>Quellcode Stockfish.js (Version 18.0.8): <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">github.com/nmrugg/stockfish.js</a></li>
      </ul>
      <p>Du darfst Stockfish nach den Bedingungen der GPLv3 nutzen, weitergeben und verändern.</p>
      <h2>Weitere Bausteine</h2>
      <ul>
        <li>chess.js – BSD-2-Clause</li>
        <li>React, React Router, Supabase JS, uqr – MIT</li>
        <li>Schriften Bricolage Grotesque, IBM Plex – SIL Open Font License 1.1</li>
        <li>Figurensätze – siehe <a href={fileUrl('/pieces/CREDITS.md')} target="_blank" rel="noreferrer">Figuren-Lizenzen</a></li>
      </ul>
    </div>
  );
}
