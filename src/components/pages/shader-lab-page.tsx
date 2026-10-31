import { Suspense } from "react"
import { ProjectSaveMount } from "@/components/editor/project-save-mount"
import { AgentBridgeMount } from "@/components/editor/agent-bridge-mount"
import { AutosaveMount } from "@/components/editor/autosave-mount"
import { EditorCanvasViewport } from "@/components/editor/editor-canvas-viewport"
import { MobileEditorDock } from "@/components/editor/mobile-editor-dock"
import { EditorShortcuts } from "@/components/editor/editor-shortcuts"
import { EditorTimelineOverlay } from "@/components/editor/editor-timeline-overlay"
import { EditorTopBar } from "@/components/editor/editor-topbar"
import { LayerSidebar } from "@/components/editor/layer-sidebar"
import { PropertiesSidebar } from "@/components/editor/properties-sidebar"
import { ThemeMount } from "@/components/editor/theme-mount"
export function ShaderLabPage() {
  return (
    <main
      id="main-content"
      className="relative h-screen w-screen overflow-hidden bg-[var(--ds-color-canvas)]"
    >
      {/* The editor chrome has no heading element; prose lives on /about. */}
      <h1 className="sr-only">
        Editor Lab — browser-based WebGPU video editor
      </h1>
      <ThemeMount />
      <AgentBridgeMount />
      <AutosaveMount />
      <ProjectSaveMount />
      <EditorShortcuts />
      <EditorCanvasViewport />
      {/* Own boundaries so selective hydration can prioritize the canvas
          instead of hydrating the whole editor as one unit. */}
      <Suspense fallback={null}>
        <EditorTimelineOverlay />
      </Suspense>
      <Suspense fallback={null}>
        <EditorTopBar />
      </Suspense>
      <Suspense fallback={null}>
        <LayerSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <PropertiesSidebar />
      </Suspense>
      <Suspense fallback={null}>
        <MobileEditorDock />
      </Suspense>
    </main>
  )
}
