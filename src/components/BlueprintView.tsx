import { ORTHO_VIEWS } from "./blueprint/data";
import {
  BlueprintPanel,
  CoreDiagram,
  ExplodedDiagram,
  ModuleTable,
  OrthographicView,
  SystemFlow,
} from "./blueprint/diagrams";

export function BlueprintView() {
  return (
    <div className="blueprint-sheet relative overflow-hidden rounded-xl border border-[#00f2ff]/25 text-[#cfeaf3] shadow-[0_24px_70px_rgba(3,12,18,0.45)]">
      <div className="pointer-events-none absolute inset-0 blueprint-scanline" aria-hidden="true" />

      <div className="relative space-y-3 p-3 sm:p-5">
        <header className="flex flex-col gap-3 border-b border-[#00f2ff]/20 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[13px] font-semibold uppercase leading-tight tracking-[0.2em] text-white sm:text-lg">
              AURIX <span className="text-[#00f2ff]">—</span> Personal AI Assistant
            </h1>
            <p className="mt-1 text-[8px] uppercase tracking-[0.26em] text-[#5f93a6] sm:text-[9px]">
              3D system architecture &amp; design blueprint
            </p>
          </div>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[8px] uppercase tracking-[0.16em] text-[#4f8ba0]">
            <div className="flex items-center gap-1.5">
              <span className="blueprint-dot h-1.5 w-1.5 rounded-full bg-[#00f2ff]" />
              <dt className="sr-only">Status</dt>
              <dd className="text-[#9fe8f5]">Core online</dd>
            </div>
            <div>
              <dt className="sr-only">Revision</dt>
              <dd>Rev 2.0</dd>
            </div>
            <div>
              <dt className="sr-only">Sheet</dt>
              <dd>Sheet 01/01</dd>
            </div>
            <div>
              <dt className="sr-only">Scale</dt>
              <dd>Scale 1:1</dd>
            </div>
            <div className="hidden sm:block">
              <dt className="sr-only">Studio</dt>
              <dd>AM Veyronix</dd>
            </div>
          </dl>
        </header>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
          <div className="space-y-3 xl:col-span-8">
            <BlueprintPanel title="Orthographic views" tag="fig. 01 — core geometry">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {ORTHO_VIEWS.map((view) => (
                  <OrthographicView key={view.id} view={view} />
                ))}
              </div>
            </BlueprintPanel>

            <BlueprintPanel title="AURIX core — system map" tag="fig. 02 — node topology">
              <CoreDiagram />
            </BlueprintPanel>

            <BlueprintPanel title="System flow diagram" tag="fig. 03 — input to output">
              <SystemFlow />
            </BlueprintPanel>
          </div>

          <aside className="space-y-3 xl:col-span-4">
            <BlueprintPanel title="Exploded view" tag="fig. 04 — assembly">
              <ExplodedDiagram />
            </BlueprintPanel>

            <BlueprintPanel title="Module registry" tag="table 01 — subsystems">
              <ModuleTable />
            </BlueprintPanel>
          </aside>
        </div>

        <footer className="flex flex-col gap-1 border-t border-[#00f2ff]/20 pt-3 text-[8px] uppercase tracking-[0.2em] text-[#4f8ba0] sm:flex-row sm:items-center sm:justify-between">
          <p>AURIX / brain / voice / agents / computer / memory / interface / tools</p>
          <p className="text-[#3f7488]">Abdul Muheeb · AM Veyronix · 2026</p>
        </footer>
      </div>
    </div>
  );
}
