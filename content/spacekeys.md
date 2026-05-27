---
updated: 2025-06-24T11:13:37.899-04:00
edited_seconds: 904
aliases: 
passages: 
passage: 
---
This is a sample keymap file for the [Spacekeys](http://github.com/jlumpe/obsidian-spacekeys) Obsidian plugin. The keymap itself is defined in a YAML code block below, it is wrapped in a Markdown file to allow editing within Obsidian. To use this file, enter its path in the Spacekeys plugin settings.

You can use the "Spacekeys: Find command ID" command to search for command IDs (either by assigning it a hotkey or invoking it through the command palette). See the plugin's description for more detailed instructions.




```yaml
items:
  SPC: 
      description: Spaceman
      items:
          SPC: obsidian-hotkeys-for-specific-files:spacekeys.md-new-tab
          f: spacekeys:find-command
          r: spacekeys:load-keymap
          c: spacekeys:get-keycode
          
          
  TAB: editor:focus
  1: file-explorer:open
  2: 
  3:
  a: templater-obsidian:create-Templates/1.Basic_Template.md
  b: templater-obsidian:create-Templates/2.Bible_Template.md
  w: templater-obsidian:create-Templates/3.Work_Template.md
  q: templater-obsidian:create-Templates/4.Quote_Template.md
  l: virtual-linker:convert-selected-virtual-links
  h: obsidian-hotkeys-for-specific-files:Home_Page.md-new-tab
  s: global-search:open
  r:
      description: Recording
      items:
          s: timetracker:start-stop-stopwatch
          r: timetracker:reset-stopwatch
          spc: timetracker:insert-timestamp
  t: 
      description: Text
      items: 
          c: inline-callouts:new-inline-callout
          d: callout-manager:manage-callouts
          r: highlightr-plugin:Red
          p: highlightr-plugin:Pink
          b: highlightr-plugin:Blue
          y: highlightr-plugin:Yellow
          o: highlightr-plugin:Orange
          g: highlightr-plugin:Green
  y: 
      description: Youtube
      items:
          t: media-notes:insert-media-timestamp
          s: ytranscript:transcript-from-prompt
          SPC: media-notes:toggle-play-pause
          f: media-notes:speed-up
          d: media-notes:slow-down
          
           
```

