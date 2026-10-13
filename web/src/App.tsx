import {
  Layout,
  Model,
  type IJsonModel,
  type TabNode,
} from "flexlayout-react";

import "flexlayout-react/style/dark.css";

const config: IJsonModel = {
  global: {},
  borders: [],
  layout: {
    type: "row",
    children: [
      {
        type: "tabset",
        weight: 20,
        children: [
          {
            type: "tab",
            name: "Controller Organizer",
            component: "organizer",
          },
          {
            type: "tab",
            name: "Tags",
            component: "tags",
          },
        ],
      },
      {
        type: "row",
        weight: 80,
        children: [
          {
            type: "tabset",
            weight: 50,
            children: [
              {
                type: "tab",
                name: "MainRoutine",
                component: "ladder",
              },
            ],
          },
          {
            type: "tabset",
            weight: 50,
            children: [
              {
                type: "tab",
                name: "PLC Simulation",
                component: "simulation",
              },
            ],
          },
        ],
      },
    ],
  },
};

const model = Model.fromJson(config);

function factory(node: TabNode) {
  switch (node.getComponent()) {
    case "organizer":
      return (
        <div className="p-4 text-sm">
          <p className="font-semibold">VirtualPLC</p>
          <div className="mt-4 space-y-3">
            <p>▾ Tasks</p>
            <p className="pl-4">▾ MainTask</p>
            <p className="pl-8">▾ MainProgram</p>
            <p className="pl-12">MainRoutine</p>
          </div>
        </div>
      );

    case "tags":
      return (
        <div className="p-4 text-sm">
          <h3 className="font-semibold">Controller Tags</h3>
          <p className="mt-3 text-zinc-400">
            Aquí se administrarán las variables PLC.
          </p>
        </div>
      );

    case "ladder":
      return (
        <div className="p-4 text-sm">
          <h3 className="font-semibold">
            MainRoutine - Ladder Editor
          </h3>
          <p className="mt-3 text-zinc-400">
            Próximamente: editor de instrucciones Ladder.
          </p>
        </div>
      );

    case "simulation":
      return (
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <h3 className="font-semibold">
              Industrial Simulation
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              Área de simulación de procesos.
            </p>
          </div>
        </div>
      );

    default:
      return <div>Panel desconocido</div>;
  }
}

export default function App() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">

      <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4">
        <h1 className="text-sm font-semibold">
          DesignerSimulator
        </h1>

        <span className="text-sm text-zinc-300">
          Desde cero / Estudio
        </span>

        <span className="text-xs text-zinc-400">
          VirtualPLC | Offline
        </span>
      </header>

      <main className="relative min-h-0 flex-1">
        <Layout
          model={model}
          factory={factory}
        />
      </main>

      <footer className="flex h-7 shrink-0 items-center border-t border-zinc-700 bg-zinc-900 px-4 text-xs text-zinc-400">
        DesignerSimulator | PLC Virtual Environment
      </footer>

    </div>
  );
}