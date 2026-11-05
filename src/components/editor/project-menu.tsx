"use client"

import { ChevronDownIcon } from "@radix-ui/react-icons"
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu"
import {
  copyStackToClipboard,
  downloadStackFile,
  openStackFile,
  pasteStackFromClipboard,
  type StackActionResult,
} from "@/editorlab/stack/stack-clipboard"
import { startProject } from "@/lib/editor/project-start"

function report(result: StackActionResult | Promise<StackActionResult>): void {
  void Promise.resolve(result).then((outcome) => {
    if (!outcome.ok) window.alert(outcome.message)
  })
}

export function ProjectMenu({ mobile = false }: { mobile?: boolean }) {
  return (
    <Menu
      align="start"
      className="w-[190px]"
      label="Project"
      side={mobile ? "top" : "bottom"}
      trigger={
        <>
          <span>Project</span>
          <ChevronDownIcon height={12} width={12} />
        </>
      }
      triggerClassName={
        mobile
          ? "min-h-11 w-full gap-2 px-3"
          : "h-7 w-auto gap-1.5 px-2 text-[12px]"
      }
    >
      <MenuItem onClick={() => startProject("blank")}>
        New blank project
      </MenuItem>
      <MenuItem onClick={() => startProject("demo")}>Open demo</MenuItem>
      <MenuSeparator />
      <MenuItem onClick={() => report(copyStackToClipboard())}>
        Copy effect stack
      </MenuItem>
      <MenuItem onClick={() => report(pasteStackFromClipboard("replace"))}>
        Paste effect stack
      </MenuItem>
      <MenuItem onClick={() => report(downloadStackFile())}>
        Save effect stack…
      </MenuItem>
      <MenuItem onClick={() => report(openStackFile("replace"))}>
        Open effect stack…
      </MenuItem>
    </Menu>
  )
}
