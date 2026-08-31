window.__ModuleLoader__.load({ id: '@opute/dsh-client-ui-opute', factory: (require) => {
  var module = { exports: {} }
  var exports = module.exports
  var React = require('react')
  var Service = require('@deepseek-ai/cordis').Service

  var INVENTORY_SLOT_KEYS = [
    'list_vms',
    'list_managed_vms',
    'list_managed_clusters',
    'list_postgresql_databases',
    'mcp__opute__list_vms',
    'mcp__opute__list_managed_vms',
    'mcp__opute__list_managed_clusters',
    'mcp__opute__list_postgresql_databases',
    'mcp__opute__host__list_vms',
    'mcp__opute__incus__list_vms',
    'mcp__opute__platform__list_managed_vms',
    'mcp__opute__platform__list_managed_clusters',
    'mcp__opute__platform__list_postgresql_databases',
  ]

  function catalogLocalName(toolName) {
    var name = String(toolName || '')
    var hostKernel = /^mcp__h([0-9a-f]{8})__(.+)$/.exec(name)
    if (hostKernel) {
      name = hostKernel[2]
      if (name.indexOf(hostKernel[1] + '_') === 0) {
        name = name.slice(hostKernel[1].length + 1)
      }
    }
    if (name.indexOf('mcp__opute__') === 0) {
      name = name.slice('mcp__opute__'.length)
    }
    var wire = /^(?:platform|incus|k3s|aggregator|db|task-ledger|platform-agent|host)__(.+)$/.exec(name)
    if (wire) return wire[1]
    var prefixed = /^([0-9a-f]{8})_(.+)$/.exec(name)
    return prefixed ? prefixed[2] : name
  }

  function textFromContentBlocks(content) {
    if (!Array.isArray(content)) return ''
    var parts = []
    for (var i = 0; i < content.length; i++) {
      var item = content[i]
      if (item && item.type === 'text' && typeof item.text === 'string') parts.push(item.text)
    }
    return parts.join('\n')
  }

  // Keep in sync with src/inventory-payload.js. This factory cannot import it.
  // DSH settled nodes are ToolResultNode `{ kind, content[] }`, not `{ output }`.
  function parsePayload(block) {
    if (!block || typeof block !== 'object') return null
    var raw = ''
    if (typeof block.output === 'string') raw = block.output
    else if (Array.isArray(block.content)) raw = textFromContentBlocks(block.content)
    else if (block.result && Array.isArray(block.result.content)) raw = textFromContentBlocks(block.result.content)
    else if (block.result && typeof block.result.output === 'string') raw = block.result.output
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return { text: raw }
    }
  }

  function listFromObject(payload) {
    if (!payload || typeof payload !== 'object') return null
    var list = payload.vms || payload.clusters || payload.databases || payload.items || payload.results || payload.instances
    return Array.isArray(list) ? list : null
  }

  function formatRow(item) {
    if (!item || typeof item !== 'object') return String(item)
    var name = item.name || item.id || item.vmName || item.clusterId || item.logicalVmId
    if (!name) return JSON.stringify(item)
    if (typeof item.status === 'string' && item.status) return name + ' · ' + item.status
    return String(name)
  }

  function rowsFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return []
    var direct = listFromObject(payload)
    if (direct) return direct.slice(0, 24).map(formatRow)
    if (payload.structuredContent && typeof payload.structuredContent === 'object') {
      var nested = rowsFromPayload(payload.structuredContent)
      if (nested.length > 0) return nested
    }
    if (Array.isArray(payload.content)) {
      var innerRaw = textFromContentBlocks(payload.content)
      if (innerRaw) {
        try {
          return rowsFromPayload(JSON.parse(innerRaw))
        } catch {
          return []
        }
      }
    }
    return []
  }

  function isRunningToolBlock(block) {
    if (!block || typeof block !== 'object') return false
    // DSH ToolCallBlock is running XOR settled; settled is `'kind' in block`.
    return !('kind' in block)
  }

  function isVmInventoryLocalName(localName) {
    return localName === 'list_vms' || localName === 'list_managed_vms'
  }

  // Keep in sync with src/vm-card-model.js. This factory cannot import it.
  function vmItemsFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return []
    var list = payload.vms || payload.instances || payload.items
    if (Array.isArray(list)) return list.filter(function (item) { return item && typeof item === 'object' }).slice(0, 24)
    if (payload.structuredContent && typeof payload.structuredContent === 'object') {
      return vmItemsFromPayload(payload.structuredContent)
    }
    return []
  }

  function toVmCardModel(item) {
    if (!item || typeof item !== 'object') return null
    var meta = item.metadata && typeof item.metadata === 'object' ? item.metadata : {}
    var additional = item.additionalInfo && typeof item.additionalInfo === 'object' ? item.additionalInfo : {}
    function first(keys) {
      var sources = [item, meta, additional]
      for (var s = 0; s < sources.length; s++) {
        var source = sources[s]
        for (var i = 0; i < keys.length; i++) {
          var value = source[keys[i]]
          if (value !== undefined && value !== null && value !== '') return value
        }
      }
      return undefined
    }
    var name = first(['name', 'id', 'logicalVmId', 'vmName'])
    if (!name) return null
    var status = first(['status', 'state']) || 'unknown'
    var hostLabel = first(['hostAgentId', 'hostId']) || ''
    var identity = first(['logicalVmId', 'id'])
    var lower = String(status).toLowerCase()
    var variant = 'outline'
    if (lower === 'running' || lower === 'ready' || lower === 'connected') variant = 'secondary'
    else if (lower === 'error' || lower === 'failed') variant = 'destructive'
    var ipv4Raw = first(['ipv4'])
    var ipv4 = Array.isArray(ipv4Raw)
      ? ipv4Raw.filter(function (ip) { return typeof ip === 'string' && ip })
      : (typeof ipv4Raw === 'string' && ipv4Raw ? [ipv4Raw] : [])
    return {
      name: String(name),
      cardKey: String(identity || (name + ':' + hostLabel)),
      status: String(status),
      providerId: String(first(['providerId']) || 'incus'),
      hostLabel: hostLabel,
      kind: first(['kind']) || 'vm',
      cpus: first(['cpus']),
      memory: first(['memory']),
      disk: first(['disk']),
      ipv4: ipv4,
      osRelease: first(['osRelease', 'release']) || '',
      k3sInstalled: first(['k3sInstalled']) === true,
      agentReady: first(['agentReady']),
      statusVariant: variant,
    }
  }

  var VM_CARD_CSS = [
    '.opute-vm-grid{display:flex;flex-direction:column;gap:12px;width:100%;min-width:0}',
    '.opute-vm-card{width:100%;min-width:0;overflow:hidden;border:1px solid oklch(1 0 0 / 10%);border-radius:12px;background:oklch(0.205 0 0);color:oklch(0.985 0 0);box-shadow:0 1px 2px oklch(0 0 0 / 25%)}',
    '.opute-vm-card-header{padding:16px 16px 12px;border-bottom:1px solid oklch(1 0 0 / 10%);background:oklch(0.269 0 0 / 50%);display:flex;flex-direction:column;gap:12px}',
    '.opute-vm-card-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
    '.opute-vm-card-title-left{display:flex;align-items:center;gap:12px;min-width:0;flex:1}',
    '.opute-vm-card-icon{display:flex;height:40px;width:40px;flex-shrink:0;align-items:center;justify-content:center;border-radius:8px;border:1px solid oklch(1 0 0 / 10%);background:oklch(0.269 0 0);color:oklch(0.985 0 0 / 70%)}',
    '.opute-vm-card-name{margin:0;font-size:13px;font-weight:700;letter-spacing:-0.01em;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.opute-vm-card-meta{display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:oklch(0.708 0 0)}',
    '.opute-vm-card-host{font-weight:500;text-transform:none;letter-spacing:0;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.opute-vm-card-dot{width:6px;height:6px;border-radius:999px;background:oklch(0.708 0 0 / 50%)}',
    '.opute-vm-card-dot.is-running{background:oklch(0.922 0 0)}',
    '.opute-vm-card-dot.is-error{background:oklch(0.704 0.191 22.216)}',
    '.opute-vm-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:6px;border:1px solid transparent;font-size:10px;font-weight:600;letter-spacing:0.04em;text-transform:capitalize}',
    '.opute-vm-badge.is-secondary{background:oklch(0.269 0 0);color:oklch(0.985 0 0)}',
    '.opute-vm-badge.is-destructive{background:oklch(0.704 0.191 22.216);color:oklch(0.985 0 0)}',
    '.opute-vm-badge.is-outline{border-color:oklch(1 0 0 / 10%);color:oklch(0.985 0 0)}',
    '.opute-vm-chip-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
    '.opute-vm-chip{display:inline-flex;align-items:center;height:18px;padding:0 6px;border-radius:6px;border:1px solid oklch(1 0 0 / 10%);font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:oklch(0.708 0 0)}',
    '.opute-vm-card-body{padding:16px;display:flex;flex-direction:column;gap:20px}',
    '.opute-vm-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}',
    '.opute-vm-stat-label{display:flex;align-items:center;gap:6px;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:oklch(0.708 0 0 / 70%);margin-bottom:4px}',
    '.opute-vm-stat-value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums}',
    '.opute-vm-stat-unit{font-size:10px;font-weight:400;color:oklch(0.708 0 0)}',
    '.opute-vm-muted{color:oklch(0.708 0 0)}',
    '.opute-vm-net{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding-top:12px;border-top:1px solid oklch(1 0 0 / 10%)}',
    '@media (max-width:419px){.opute-vm-stats,.opute-vm-net{grid-template-columns:1fr}}',
  ].join('')

  function ensureVmCardStyles() {
    if (typeof document === 'undefined') return
    if (document.getElementById('opute-vm-card-css')) return
    var style = document.createElement('style')
    style.id = 'opute-vm-card-css'
    style.textContent = VM_CARD_CSS
    document.head.appendChild(style)
  }

  function lucideIcon(children, size) {
    return React.createElement(
      'svg',
      {
        width: size || 20,
        height: size || 20,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      },
      children,
    )
  }

  function IconMonitor() {
    return lucideIcon([
      React.createElement('rect', { key: 'r', width: 20, height: 14, x: 2, y: 3, rx: 2 }),
      React.createElement('line', { key: 'l1', x1: 8, x2: 16, y1: 21, y2: 21 }),
      React.createElement('line', { key: 'l2', x1: 12, x2: 12, y1: 17, y2: 21 }),
    ])
  }

  function IconCpu() {
    return lucideIcon([
      React.createElement('rect', { key: 'r', width: 16, height: 16, x: 4, y: 4, rx: 2 }),
      React.createElement('rect', { key: 'i', width: 6, height: 6, x: 9, y: 9 }),
    ], 12)
  }

  function IconMemory() {
    return lucideIcon([
      React.createElement('path', { key: 'p', d: 'M6 19v-3' }),
      React.createElement('path', { key: 'p2', d: 'M10 19v-3' }),
      React.createElement('path', { key: 'p3', d: 'M14 19v-3' }),
      React.createElement('path', { key: 'p4', d: 'M18 19v-3' }),
      React.createElement('rect', { key: 'r', width: 20, height: 12, x: 2, y: 4, rx: 2 }),
    ], 12)
  }

  function IconDisk() {
    return lucideIcon([
      React.createElement('line', { key: 'l', x1: 22, x2: 2, y1: 12, y2: 12 }),
      React.createElement('path', { key: 'p', d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }),
    ], 12)
  }

  function IconNetwork() {
    return lucideIcon([
      React.createElement('rect', { key: 'r', x: 9, y: 2, width: 6, height: 6, rx: 1 }),
      React.createElement('path', { key: 'p', d: 'M12 8v4' }),
      React.createElement('path', { key: 'p2', d: 'M8 16h8' }),
      React.createElement('path', { key: 'p3', d: 'M6 22h12' }),
    ], 12)
  }

  function IconGlobe() {
    return lucideIcon([
      React.createElement('circle', { key: 'c', cx: 12, cy: 12, r: 10 }),
      React.createElement('path', { key: 'p', d: 'M2 12h20' }),
      React.createElement('path', { key: 'p2', d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }),
    ], 12)
  }

  function StatCell(props) {
    return React.createElement(
      'div',
      { className: 'opute-vm-stat' },
      React.createElement('div', { className: 'opute-vm-stat-label' }, props.icon, React.createElement('span', null, props.label)),
      React.createElement(
        'div',
        { className: 'opute-vm-stat-value' },
        props.value
          ? props.unit
            ? React.createElement(React.Fragment, null, String(props.value), ' ', React.createElement('span', { className: 'opute-vm-stat-unit' }, props.unit))
            : String(props.value)
          : React.createElement('span', { className: 'opute-vm-muted' }, '—'),
      ),
    )
  }

  function OputeVmSummaryCard(props) {
    var vm = props.vm
    ensureVmCardStyles()
    var running = vm.statusVariant === 'secondary'
    var primaryIp = vm.ipv4[0]
    var extraIps = Math.max(vm.ipv4.length - 1, 0)
    var os = vm.osRelease && vm.osRelease !== 'unknown' ? vm.osRelease : ''
    var chips = [
      React.createElement('span', { key: 'kind', className: 'opute-vm-chip' }, String(vm.kind).toUpperCase()),
    ]
    if (vm.k3sInstalled) {
      chips.push(React.createElement('span', { key: 'k3s', className: 'opute-vm-chip' }, 'K3S READY'))
    }
    if (running && vm.agentReady === true) {
      chips.push(React.createElement('span', { key: 'agent', className: 'opute-vm-chip' }, 'Guest Agent Ready'))
    } else if (running && vm.agentReady === false) {
      chips.push(React.createElement('span', { key: 'agent', className: 'opute-vm-chip' }, 'Guest Agent Offline'))
    }
    return React.createElement(
      'article',
      {
        className: 'opute-vm-card',
        'data-opute-vm-card': vm.cardKey || vm.name,
        'data-testid': 'chat-vm-' + (vm.cardKey || vm.name),
      },
      React.createElement(
        'header',
        { className: 'opute-vm-card-header' },
        React.createElement(
          'div',
          { className: 'opute-vm-card-title-row' },
          React.createElement(
            'div',
            { className: 'opute-vm-card-title-left' },
            React.createElement('div', { className: 'opute-vm-card-icon' }, React.createElement(IconMonitor)),
            React.createElement(
              'div',
              { style: { minWidth: 0 } },
              React.createElement('h3', { className: 'opute-vm-card-name', title: vm.name }, vm.name),
              React.createElement(
                'div',
                { className: 'opute-vm-card-meta' },
                React.createElement('span', null, vm.providerId),
                vm.hostLabel
                  ? React.createElement(React.Fragment, null,
                    React.createElement('span', { style: { opacity: 0.6 } }, '·'),
                    React.createElement('span', { className: 'opute-vm-card-host', title: vm.hostLabel }, vm.hostLabel),
                  )
                  : null,
                React.createElement('span', {
                  className: 'opute-vm-card-dot' + (running ? ' is-running' : vm.statusVariant === 'destructive' ? ' is-error' : ''),
                  title: vm.status,
                }),
              ),
            ),
          ),
          React.createElement(
            'span',
            { className: 'opute-vm-badge is-' + vm.statusVariant },
            vm.status,
          ),
        ),
        React.createElement('div', { className: 'opute-vm-chip-row' }, chips),
      ),
      React.createElement(
        'div',
        { className: 'opute-vm-card-body' },
        React.createElement(
          'div',
          { className: 'opute-vm-stats', 'data-testid': 'chat-vm-' + (vm.cardKey || vm.name) + '-resource-stats' },
          React.createElement(StatCell, { icon: React.createElement(IconCpu), label: 'CPUs', value: vm.cpus, unit: vm.cpus ? 'vCPU' : '' }),
          React.createElement(StatCell, { icon: React.createElement(IconMemory), label: 'RAM', value: vm.memory }),
          React.createElement(StatCell, { icon: React.createElement(IconDisk), label: 'Disk', value: vm.disk }),
        ),
        React.createElement(
          'div',
          { className: 'opute-vm-net' },
          React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'opute-vm-stat-label' }, React.createElement(IconNetwork), React.createElement('span', null, 'Network')),
            React.createElement(
              'div',
              { className: 'opute-vm-stat-value' },
              primaryIp || React.createElement('span', { className: 'opute-vm-muted' }, '—'),
              extraIps > 0 ? React.createElement('span', { className: 'opute-vm-muted', style: { marginLeft: 6, fontWeight: 500 } }, '(+' + extraIps + ')') : null,
            ),
          ),
          React.createElement(
            'div',
            null,
            React.createElement('div', { className: 'opute-vm-stat-label' }, React.createElement(IconGlobe), React.createElement('span', null, 'Environment')),
            React.createElement(
              'div',
              { className: 'opute-vm-stat-value opute-vm-muted', style: { textTransform: 'lowercase' } },
              os || '—',
            ),
          ),
        ),
      ),
    )
  }

  function titleFor(localName) {
    if (localName === 'list_vms') return 'VMs'
    if (localName === 'list_managed_vms') return 'Managed VMs'
    if (localName === 'list_managed_clusters') return 'Managed clusters'
    if (localName === 'list_postgresql_databases') return 'PostgreSQL databases'
    return localName
  }

  function OputeInventoryList(props) {
    var toolName = props.toolName
    var block = props.block
    var localName = catalogLocalName(toolName)
    var payload = parsePayload(block)
    var rows = rowsFromPayload(payload)
    var running = isRunningToolBlock(block)
    return React.createElement(
      'div',
      {
        'data-opute-inventory': localName,
        style: {
          border: '1px solid rgba(127,127,127,0.35)',
          borderRadius: '8px',
          padding: '8px 10px',
          fontSize: '13px',
        },
      },
      React.createElement('div', { style: { fontWeight: 600, marginBottom: '6px' } }, titleFor(localName)),
      running
        ? React.createElement('div', null, 'Running…')
        : rows.length === 0
          ? React.createElement('div', { style: { opacity: 0.7 } }, payload && payload.text ? payload.text : 'No rows')
          : React.createElement(
            'ul',
            { style: { margin: 0, paddingLeft: '1.2em' } },
            rows.map(function (row, index) {
              return React.createElement('li', { key: String(index) }, row)
            }),
          ),
    )
  }

  function OputeInventoryCard(props) {
    var localName = catalogLocalName(props.toolName)
    if (isRunningToolBlock(props.block)) {
      return React.createElement(OputeInventoryList, props)
    }
    if (isVmInventoryLocalName(localName)) {
      var cards = vmItemsFromPayload(parsePayload(props.block)).map(toVmCardModel).filter(Boolean)
      var names = cards.map(function (vm) { return vm.name }).join(', ')
      return React.createElement(
        'div',
        { 'data-opute-vm-summary': localName, style: { fontSize: '13px' } },
        cards.length === 0
          ? 'VMs'
          : String(cards.length) + ' VM' + (cards.length === 1 ? '' : 's') + (names ? ' · ' + names : ''),
      )
    }
    return React.createElement(OputeInventoryList, props)
  }

  function vmsFromToolResultEvent(event) {
    var message = event.data && event.data.message
    var result = message && Array.isArray(message.content) ? message.content[0] : null
    if (!result || result.isError) return []
    var raw = Array.isArray(result.content) ? textFromContentBlocks(result.content) : ''
    if (!raw) return []
    try {
      return vmItemsFromPayload(JSON.parse(raw))
    } catch {
      return []
    }
  }

  var oputeVmInventoryDefinition = {
    kind: 'opute-vm-inventory',
    match: function (event) {
      if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
      if (event.type === 'tool/call' || event.type === 'tool/result') {
        return { id: String(event.data.turn), role: 'update' }
      }
      return null
    },
    start: function (_context, match) {
      return { turn: match.event.data.turn, calls: {}, vms: [] }
    },
    update: function (context, match) {
      var event = match.event
      if (event.type === 'tool/call') {
        var calls = Object.assign({}, context.state.calls)
        calls[String(event.data.callId)] = event.data.name
        return { turn: context.state.turn, calls: calls, vms: context.state.vms }
      }
      if (event.type !== 'tool/result') return context.state
      var source = event.data.message && event.data.message.source
      var name = context.state.calls[String(source && source.callId)]
      if (!isVmInventoryLocalName(catalogLocalName(name))) return context.state
      var rows = vmsFromToolResultEvent(event)
      if (rows.length === 0) return context.state
      return { turn: context.state.turn, calls: context.state.calls, vms: rows }
    },
    buildLocationData: function (context, scope) {
      if (scope !== 'turn' || !context.state || context.state.vms.length === 0) return null
      // Overlay keeps key === kind for older DSH; current engine stamps kind itself.
      return {
        kind: 'turn',
        turn: context.state.turn,
        key: 'opute-vm-inventory',
        value: { vms: context.state.vms },
      }
    },
  }

  // Keep in sync with src/trajectory-assemble-trace.js. This factory cannot import it.
  // Log-only assemble stages are Trajectory context rows, not chat surface nodes.
  var oputeAssembleTraceDefinition = {
    kind: 'opute-assemble-trace',
    target: 'trajectory',
    match: function (event) {
      if (event.type !== 'opute/execution-trace') return null
      return { id: String(event.seq), role: 'start' }
    },
    start: function (_context, match) {
      var event = match.event
      var data = event.data && typeof event.data === 'object' ? event.data : {}
      var stages = Array.isArray(data.events)
        ? data.events.filter(function (entry) { return entry && typeof entry === 'object' })
        : []
      var first = stages[0] || {}
      var stage = typeof first.stage === 'string' ? first.stage : ''
      var form = 'notice'
      if (stage === 'retrieval-input') form = 'recall'
      else if (stage === 'rank-fusion-reranking' || stage === 'authorized-tool-selection') form = 'catalog'
      else if (stage === 'context-injection') form = 'snapshot'
      var source = { kind: 'plugin', plugin: 'opute-tool-retrieval' }
      if (stage) source.stage = stage
      return {
        kind: 'context',
        seq: event.seq,
        time: event.time,
        content: stages.map(function (entry) {
          var lines = []
          if (typeof entry.stage === 'string' && entry.stage) lines.push(entry.stage)
          if (typeof entry.label === 'string' && entry.label) lines.push(entry.label)
          if (typeof entry.detail === 'string' && entry.detail) lines.push(entry.detail)
          return { type: 'text', text: lines.join('\n') }
        }),
        source: source,
        provenance: {
          role: 'inject',
          label: stage || 'opute-tool-retrieval',
        },
        form: form,
      }
    },
    update: function (context) { return context.state },
    buildViewNode: function (context) {
      if (!context.state || context.state.kind !== 'context') return null
      if (!Array.isArray(context.state.content) || context.state.content.length === 0) return null
      return {
        key: context.key,
        kind: context.kind,
        id: context.id,
        target: 'trajectory',
        anchorSeq: context.state.seq,
        location: context.start && context.start.location ? context.start.location : { kind: 'unresolved' },
        data: { kind: 'node', node: context.state },
      }
    },
  }

  function selectOputeVmInventory(owner) {
    var data = owner.turn && owner.turn.data && typeof owner.turn.data.get === 'function'
      ? owner.turn.data.get('opute-vm-inventory')
      : null
    if (!data || !Array.isArray(data.vms) || data.vms.length === 0) return null
    return data.vms
  }

  function OputeVmTurnTail(props) {
    var cards = (props.matched || []).map(toVmCardModel).filter(Boolean)
    if (cards.length === 0) return null
    return React.createElement(
      'div',
      { className: 'opute-vm-grid', 'data-opute-vm-grid': 'turn-tail' },
      cards.map(function (vm, index) {
        return React.createElement(OputeVmSummaryCard, { key: vm.cardKey || (vm.name + ':' + index), vm: vm })
      }),
    )
  }

  function isOputeWorkspaceItem(item) {
    if (!item) return false
    if (item.title === 'Opute') return true
    var path = typeof item.path === 'string' ? item.path.replace(/\\/g, '/') : ''
    return /\/opute-workspace\/?$/.test(path)
  }

  function firstWorkspaceId(workspaces) {
    var snap = workspaces.list.getSnapshot()
    var items = (snap && snap.items) || []
    for (var i = 0; i < items.length; i++) {
      if (isOputeWorkspaceItem(items[i])) return items[i].workspaceId
    }
    return items[0] && items[0].workspaceId
  }

  class OputeUiWorkspace extends Service {
    constructor(ctx, sessions, workspaces) {
      super(ctx, 'uiWorkspace')
      this.sessions = sessions
      this.workspaces = workspaces
      this.connecting = new Map()
      var self = this
      ctx.effect(function () {
        return self.watchNavigation()
      }, 'ui-opute: session navigation')
    }

    connectWorkspace(workspaceId) {
      var self = this
      var inflight = this.connecting.get(workspaceId)
      if (inflight) return inflight
      var attempt = this.sessions.create({ workspaceId: workspaceId }).finally(function () {
        self.connecting.delete(workspaceId)
      })
      this.connecting.set(workspaceId, attempt)
      return attempt
    }

    startSession(workspaceId) {
      var target = workspaceId || firstWorkspaceId(this.workspaces)
      if (!target) {
        this.sessions.clear()
        return
      }
      var sessions = this.sessions
      void this.connectWorkspace(target).then(
        function (sessionId) { sessions.open(sessionId) },
        function (reason) { console.warn('new session failed:', reason) },
      )
    }

    archiveSession(sessionId) {
      return this.workspaces.archiveSession(sessionId)
    }

    pickDirectory() {
      return Promise.resolve(null)
    }

    listDirectory() {
      return Promise.reject(new Error('Opute harness has no host directory picker'))
    }

    createDirectory() {
      return Promise.reject(new Error('Opute harness has no host directory picker'))
    }

    watchNavigation() {
      var self = this
      var initial = 'waiting'
      var disposed = false
      function reconcile() {
        if (disposed || initial !== 'waiting') return
        var workspace = self.workspaces.list.getSnapshot()
        var sessions = self.sessions.list.getSnapshot()
        if (!workspace || workspace.phase !== 'ready' || !sessions || sessions.phase !== 'ready') return
        var current = sessions.current
        var byId = sessions.byId || {}
        var row = current !== undefined ? byId[current] : undefined
        var target = firstWorkspaceId(self.workspaces)
        var currentCwd = row && typeof row.cwd === 'string' ? row.cwd.replace(/\\/g, '/') : ''
        var onOpute = /\/opute-workspace\/?$/.test(currentCwd)
        if (row && onOpute) {
          initial = 'done'
          return
        }
        if (!target) {
          initial = 'done'
          return
        }
        initial = 'connecting'
        void self.connectWorkspace(target).then(
          function (sessionId) {
            if (disposed) return
            if (self.sessions.list.getSnapshot().current === undefined) {
              self.sessions.open(sessionId)
            }
            initial = 'done'
          },
          function (reason) {
            if (disposed) return
            initial = 'waiting'
            console.warn('initial session failed:', reason)
          },
        )
      }
      var disposeWorkspaces = this.workspaces.list.subscribe(reconcile)
      var disposeSessions = this.sessions.list.subscribe(reconcile)
      reconcile()
      return function () {
        disposed = true
        disposeSessions()
        disposeWorkspaces()
      }
    }
  }

  function OputeSessionRail(props) {
    var sessions = props.sessions
    var wide = props.wide
    var snap = React.useSyncExternalStore(
      function subscribe(onStoreChange) {
        return sessions.list.subscribe(onStoreChange)
      },
      function getSnapshot() {
        return sessions.list.getSnapshot()
      },
    )
    // Collapsed rail is 56px; labels belong only in the expanded column.
    // The shell already owns New chat + expand. An empty region here is correct.
    if (!wide) return null
    var ids = (snap && snap.ids) || []
    var byId = (snap && snap.byId) || {}
    var current = snap && snap.current
    var visible = ids.filter(function (id) {
      var row = byId[id]
      if (!row) return false
      if (row.blank && id !== current) return false
      return true
    })
    return React.createElement(
      'div',
      {
        'data-opute-session-rail': 'true',
        style: {
          padding: '4px 8px',
          fontSize: '13px',
          overflow: 'hidden',
          minWidth: 0,
        },
      },
      visible.length === 0
        ? React.createElement('div', { style: { opacity: 0.7 } }, 'No chats yet')
        : React.createElement(
          'ul',
          { style: { listStyle: 'none', margin: 0, padding: 0 } },
          visible.map(function (id) {
            var row = byId[id]
            var title = row && row.blank
              ? 'New chat'
              : (row && (row.displayTitle || row.title)) || String(id)
            var selected = id === current
            return React.createElement(
              'li',
              { key: String(id), style: { marginBottom: '4px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: function () { sessions.open(id) },
                  style: {
                    width: '100%',
                    textAlign: 'left',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: selected ? 600 : 400,
                  },
                },
                title,
              ),
            )
          }),
        ),
    )
  }

  // Keep in sync with src/preferred-model.js. This factory cannot import it.
  var OPENROUTER_PREFERRED = [
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'deepseek/deepseek-chat',
  ]
  var OLLAMA_PREFERRED = ['llama3.2', 'qwen2.5', 'mistral']

  function selectionOf(provider, model) {
    var sel = { provider: provider, model: model.id }
    if (model.reasoning && model.reasoning.defaultEffort) {
      sel.reasoningEffort = model.reasoning.defaultEffort
    }
    return sel
  }

  function groupModel(group, modelId) {
    if (!group || !group.models) return null
    for (var i = 0; i < group.models.length; i++) {
      if (group.models[i].id === modelId) return selectionOf(group.id, group.models[i])
    }
    return null
  }

  function firstModel(group) {
    if (!group || !group.models || !group.models[0]) return null
    return selectionOf(group.id, group.models[0])
  }

  function candidateSelections(groups) {
    var list = groups || []
    var byId = {}
    for (var i = 0; i < list.length; i++) byId[list[i].id] = list[i]
    var out = []
    var seen = {}
    function add(sel) {
      if (!sel) return
      var key = sel.provider + '\0' + sel.model
      if (seen[key]) return
      seen[key] = true
      out.push(sel)
    }
    var openrouter = byId.openrouter
    if (openrouter) {
      for (var i = 0; i < OPENROUTER_PREFERRED.length; i++) add(groupModel(openrouter, OPENROUTER_PREFERRED[i]))
      add(firstModel(openrouter))
    }
    var ollama = byId.ollama
    if (ollama) {
      for (var i = 0; i < OLLAMA_PREFERRED.length; i++) add(groupModel(ollama, OLLAMA_PREFERRED[i]))
      add(firstModel(ollama))
    }
    for (var g = 0; g < list.length; g++) add(firstModel(list[g]))
    return out
  }

  // The model seat still renders projected.next (deepseek-official/…) after
  // llm-deepseek is disabled. routableProviders omits that adapter, so the
  // composer goes inert while the dropdown looks selected. Move the open
  // session onto the first live OpenRouter/Ollama route.
  function watchUnroutableModel(ctx, sessions) {
    ctx.inject(['modelDirectories'], function (scope) {
      var models = scope.modelDirectories
      var attachedId = null
      var detach = function () {}
      var remapping = false
      var attempted = {}
      var retryTimer = null
      var retryCount = 0

      function consider(directory, sessionId) {
        var state = directory.store.getSnapshot()
        if (state.routable !== false || state.status === 'selecting' || remapping) return
        if (attempted[sessionId]) return
        var candidates = candidateSelections(state.groups)
        if (candidates.length === 0) return
        attempted[sessionId] = true
        remapping = true
        void (async function () {
          for (var i = 0; i < candidates.length; i++) {
            try {
              await directory.select(candidates[i])
              return
            } catch (err) {
              console.warn('opute: skipped unusable model', candidates[i], err)
            }
          }
        }()).finally(function () { remapping = false })
      }

      function attach(sessionId) {
        if (retryTimer) {
          clearTimeout(retryTimer)
          retryTimer = null
        }
        if (sessionId === attachedId) return
        detach()
        attachedId = sessionId
        if (!sessionId) {
          retryCount = 0
          detach = function () {}
          return
        }
        var directory
        try {
          directory = models.directoryFor(sessionId)
        } catch {
          attachedId = null
          detach = function () {}
          if (retryCount < 40) {
            retryCount += 1
            retryTimer = setTimeout(function () {
              retryTimer = null
              attach(sessionId)
            }, 50)
          }
          return
        }
        retryCount = 0
        var stop = directory.store.subscribe(function () { consider(directory, sessionId) })
        void directory.load().catch(function () {})
        consider(directory, sessionId)
        detach = function () {
          stop()
          attachedId = null
        }
      }

      function onSessions() {
        var snap = sessions.list.getSnapshot()
        attach(snap && snap.current)
      }

      scope.effect(function () {
        var stop = sessions.list.subscribe(onSessions)
        onSessions()
        return function () {
          stop()
          detach()
          if (retryTimer) {
            clearTimeout(retryTimer)
            retryTimer = null
          }
        }
      }, 'ui-opute: remap unroutable model')
    })
  }

  // Keep in sync with src/execution-trace-view.js. This factory cannot import it.
  var OPUTE_TRACE_KEY = 'oputeTrace'
  var EMPTY_TRACE_TITLE = 'No assemble trace this session'

  function latestTraceFromProjection(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null
    var turn = snapshot.latestTurn
    var turns = snapshot.turns && typeof snapshot.turns === 'object' ? snapshot.turns : null
    if (!turns) return null
    var entry = turns[String(turn)] != null ? turns[String(turn)] : turns[turn]
    if (!entry || !Array.isArray(entry.events)) return null
    return { turn: turn, events: entry.events }
  }

  function executionTraceSummary(snapshot) {
    var latest = latestTraceFromProjection(snapshot)
    if (!latest || latest.events.length === 0) {
      return { empty: true, title: EMPTY_TRACE_TITLE, eventCount: 0, events: [], turn: 0 }
    }
    return {
      empty: false,
      title: 'Execution Trace · ' + latest.events.length + ' event' + (latest.events.length === 1 ? '' : 's'),
      eventCount: latest.events.length,
      events: latest.events,
      turn: latest.turn,
    }
  }

  function OputeExecutionTrace(props) {
    var snapshot = typeof props.useProjection === 'function' ? props.useProjection(OPUTE_TRACE_KEY) : undefined
    var summary = executionTraceSummary(snapshot)
    var openState = React.useState(false)
    var open = openState[0]
    var setOpen = openState[1]
    var expandedState = React.useState({})
    var expanded = expandedState[0]
    var setExpanded = expandedState[1]

    return React.createElement(
      'div',
      {
        'data-testid': 'chat-execution-trace',
        'data-trace-empty': summary.empty ? 'true' : 'false',
        style: { position: 'relative', fontSize: '12px' },
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'chat-execution-trace-trigger',
          'aria-expanded': open,
          onClick: function () { setOpen(!open) },
          style: {
            border: '1px solid rgba(127,127,127,0.35)',
            borderRadius: '8px',
            background: 'transparent',
            color: 'inherit',
            padding: '4px 8px',
            cursor: 'pointer',
            maxWidth: '18rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        },
        summary.title,
      ),
      open ? React.createElement(
        'div',
        {
          'data-testid': 'chat-execution-trace-panel',
          style: {
            position: 'absolute',
            right: 0,
            top: '100%',
            zIndex: 20,
            marginTop: '4px',
            width: 'min(28rem, 80vw)',
            maxHeight: '22rem',
            overflow: 'auto',
            border: '1px solid rgba(127,127,127,0.35)',
            borderRadius: '8px',
            background: 'var(--dsh-bg, #111)',
            color: 'inherit',
            padding: '8px 10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          },
        },
        summary.empty
          ? React.createElement('div', { style: { opacity: 0.7 } }, EMPTY_TRACE_TITLE)
          : summary.events.map(function (event, index) {
            var key = String(event.stage || index) + '-' + index
            var isOpen = Boolean(expanded[key])
            return React.createElement(
              'div',
              { key: key, style: { marginBottom: '8px' } },
              React.createElement(
                'button',
                {
                  type: 'button',
                  onClick: function () {
                    setExpanded(function (current) {
                      var next = Object.assign({}, current)
                      next[key] = !current[key]
                      return next
                    })
                  },
                  style: {
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    background: 'transparent',
                    color: 'inherit',
                    padding: 0,
                    cursor: 'pointer',
                  },
                },
                React.createElement('div', { style: { fontWeight: 600 } }, event.label || event.stage),
                event.detail ? React.createElement('div', { style: { opacity: 0.75, marginTop: '2px' } }, event.detail) : null,
              ),
              isOpen && event.data
                ? React.createElement(
                  'pre',
                  {
                    style: {
                      margin: '6px 0 0',
                      padding: '6px',
                      overflow: 'auto',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    },
                  },
                  JSON.stringify(event.data, null, 2),
                )
                : null,
            )
          }),
      ) : null,
    )
  }

  // Must not hard-require uiConversation. This plugin *provides* uiWorkspace
  // (stock ui-workspace is disabled); conversation waits on that service, then
  // publishes uiConversation. A static inject of uiConversation deadlocks boot.
  var OPUTE_INSTRUCTIONS_NS = 'opute-system-prompt'

  // Keep in sync with src/brand.js. This factory cannot import it.
  var OPUTE_PRODUCT_TITLE = 'Opute'
  var OPUTE_MARK_PATH = 'M12 2L2 12H5V22H19V12H22L12 2Z'
  var OPUTE_BRAND_PRIORITY = -10
  var DSH_PRODUCT_TITLES = ['DeepSeek Harness', 'DSH Local Build', 'DSH 本地构建']
  var BRANDED_COPY = [
    ['DeepSeek Harness', OPUTE_PRODUCT_TITLE],
    ['DSH Local Build', OPUTE_PRODUCT_TITLE],
    ['DSH 本地构建', OPUTE_PRODUCT_TITLE],
    ['Into the Unknown', OPUTE_PRODUCT_TITLE],
    ['探索未至之境', OPUTE_PRODUCT_TITLE],
  ]

  function rewriteProductTitle(title, product) {
    var current = typeof title === 'string' ? title : ''
    var name = product || OPUTE_PRODUCT_TITLE
    for (var i = 0; i < DSH_PRODUCT_TITLES.length; i++) {
      var suffix = DSH_PRODUCT_TITLES[i]
      if (current === suffix) return name
      var tail = ' — ' + suffix
      if (current.endsWith(tail)) return current.slice(0, -tail.length) + ' — ' + name
    }
    return current
  }

  function replaceBrandedCopy(text) {
    if (typeof text !== 'string' || text === '') return text
    var next = text
    for (var i = 0; i < BRANDED_COPY.length; i++) {
      var pair = BRANDED_COPY[i]
      if (next.indexOf(pair[0]) !== -1) next = next.split(pair[0]).join(pair[1])
    }
    return next
  }

  function oputeFaviconHref() {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">'
      + '<style>@media (prefers-color-scheme: dark) { path { fill: #fff; } }</style>'
      + '<path d="' + OPUTE_MARK_PATH + '" fill="#000"/>'
      + '</svg>'
    return 'data:image/svg+xml,' + encodeURIComponent(svg)
  }

  function applyOputeFavicon() {
    var href = oputeFaviconHref()
    var link = document.querySelector('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/svg+xml'
      document.head.appendChild(link)
    }
    link.type = 'image/svg+xml'
    link.href = href
  }

  function rewriteDocumentCopy(root) {
    if (!root || typeof document.createTreeWalker !== 'function') return
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        var tag = parent.tagName
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') {
          return NodeFilter.FILTER_REJECT
        }
        if (parent.isContentEditable) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    var node
    while ((node = walker.nextNode())) {
      var next = replaceBrandedCopy(node.nodeValue)
      if (next !== node.nodeValue) node.nodeValue = next
    }
  }

  function applyOputeChrome() {
    if (typeof document === 'undefined') return function () {}
    applyOputeFavicon()
    var rewriteTitle = function () {
      var next = rewriteProductTitle(document.title)
      if (next !== document.title) document.title = next
    }
    rewriteTitle()
    var obs = new MutationObserver(function () {
      rewriteTitle()
      if (document.body) rewriteDocumentCopy(document.body)
    })
    var titleEl = document.querySelector('title')
    if (titleEl) obs.observe(titleEl, { childList: true, characterData: true, subtree: true })
    if (document.body) {
      rewriteDocumentCopy(document.body)
      obs.observe(document.body, { childList: true, characterData: true, subtree: true })
    } else {
      document.addEventListener('DOMContentLoaded', function onReady() {
        document.removeEventListener('DOMContentLoaded', onReady)
        rewriteDocumentCopy(document.body)
        obs.observe(document.body, { childList: true, characterData: true, subtree: true })
      })
    }
    return function () { obs.disconnect() }
  }

  function OputeBrandMark(props) {
    var size = (props && props.size) || 24
    return React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        className: props && props.className,
        'aria-hidden': 'true',
        'data-opute-brand-mark': 'true',
      },
      React.createElement('path', { d: OPUTE_MARK_PATH, fill: 'currentColor' }),
    )
  }

  function OputeBrandName() {
    return React.createElement(
      'span',
      {
        'data-opute-brand-name': 'true',
        style: { fontWeight: 650, letterSpacing: '0.08em', textTransform: 'uppercase' },
      },
      'Opute',
    )
  }

  function SkipDshOnboarding(props) {
    React.useEffect(function () {
      if (typeof props.complete === 'function') props.complete()
    }, [props.complete])
    return null
  }


  function instructionsFromSnapshot(snap) {
    var value = snap && snap.value
    return value && typeof value.instructions === 'string' ? value.instructions : ''
  }

  function OputeInstructionsCard(props) {
    var scope = props.scope
    var snapState = React.useState(function () { return scope.getSnapshot() })
    var snap = snapState[0]
    var setSnap = snapState[1]
    var stored = instructionsFromSnapshot(snap)
    var draftState = React.useState(stored)
    var draft = draftState[0]
    var setDraft = draftState[1]
    var savingState = React.useState(false)
    var saving = savingState[0]
    var setSaving = savingState[1]
    var failedState = React.useState(false)
    var failed = failedState[0]
    var setFailed = failedState[1]
    var openState = React.useState(true)
    var open = openState[0]
    var setOpen = openState[1]

    React.useEffect(function () {
      return scope.subscribe(function () {
        setSnap(scope.getSnapshot())
      })
    }, [scope])

    var dirty = draft !== stored
    React.useEffect(function () {
      if (!dirty && !saving) setDraft(stored)
    }, [stored, dirty, saving])

    if (snap.status !== 'ready') return null

    function onSave() {
      if (!dirty || saving || !snap.writable) return
      setSaving(true)
      setFailed(false)
      var write = draft.trim() === ''
        ? scope.unset('instructions')
        : scope.set('instructions', draft)
      Promise.resolve(write).then(function () {
        setSaving(false)
        var next = scope.getSnapshot()
        setSnap(next)
        var landed = instructionsFromSnapshot(next)
        if (draft.trim() === '') {
          if (landed !== '') setFailed(true)
          else setDraft('')
          return
        }
        if (landed !== draft) setFailed(true)
      }, function () {
        setSaving(false)
        setFailed(true)
      })
    }

    var inputStyle = {
      width: '100%',
      minHeight: 160,
      resize: 'vertical',
      boxSizing: 'border-box',
      padding: '10px 12px',
      borderRadius: 8,
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'var(--dsw-alias-bg-layer-1, transparent)',
      color: 'inherit',
      font: 'inherit',
      lineHeight: 1.45,
    }
    var btnStyle = {
      appearance: 'none',
      border: 0,
      borderRadius: 8,
      padding: '6px 12px',
      font: 'inherit',
      cursor: 'pointer',
    }

    return React.createElement(
      'li',
      {
        style: {
          listStyle: 'none',
          border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 12,
          background: open ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-bg-layer-3)',
        },
      },
      React.createElement(
        'button',
        {
          type: 'button',
          'aria-expanded': open,
          onClick: function () { setOpen(!open) },
          style: {
            width: '100%',
            appearance: 'none',
            border: 0,
            background: 'none',
            font: 'inherit',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          },
        },
        React.createElement('span', { style: { fontWeight: 600 } }, 'System instructions'),
        React.createElement(
          'span',
          { style: { color: 'var(--dsw-alias-label-dimmed)', fontSize: 13 } },
          'Sent as the model system prompt. Empty means none.',
        ),
        dirty ? React.createElement(
          'span',
          { style: { fontSize: 12, color: 'var(--dsw-alias-brand-primary)' } },
          'Unsaved',
        ) : null,
      ),
      open ? React.createElement(
        'div',
        { style: { padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 } },
        !snap.writable ? React.createElement(
          'p',
          { role: 'status', style: { margin: 0, color: 'var(--dsw-alias-label-dimmed)', fontSize: 13 } },
          'This deployment stores settings read-only.',
        ) : null,
        React.createElement('textarea', {
          id: 'plugin-config-opute-system-prompt',
          value: draft,
          disabled: !snap.writable || saving,
          onChange: function (event) {
            setFailed(false)
            setDraft(event.target.value)
          },
          placeholder: 'Optional. Takes effect on the next model step.',
          style: inputStyle,
        }),
        failed ? React.createElement(
          'p',
          { role: 'status', style: { margin: 0, color: 'var(--dsw-alias-danger, #c44)', fontSize: 13 } },
          'The deployment did not accept these values; they were left for you to correct.',
        ) : null,
        React.createElement(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: 8 } },
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: !dirty || saving,
              onClick: function () {
                setFailed(false)
                setDraft(stored)
              },
              style: Object.assign({}, btnStyle, {
                background: 'transparent',
                color: 'inherit',
                opacity: !dirty || saving ? 0.5 : 1,
              }),
            },
            'Discard',
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              disabled: !dirty || saving,
              onClick: onSave,
              style: Object.assign({}, btnStyle, {
                background: 'var(--dsw-alias-brand-primary)',
                color: 'var(--dsw-alias-label-on-brand, #fff)',
                opacity: !dirty || saving ? 0.5 : 1,
              }),
            },
            saving ? 'Saving…' : 'Save',
          ),
        ),
      ) : null,
    )
  }

  exports.inject = ['slots', 'sessions', 'workspaces', 'connection']
  exports.apply = function apply(ctx) {
    var sessions = ctx.get('sessions')
    var workspaces = ctx.get('workspaces')
    var uiWorkspace = new OputeUiWorkspace(ctx, sessions, workspaces)
    watchUnroutableModel(ctx, sessions)
    ctx.effect(function () {
      return applyOputeChrome()
    }, 'ui-opute: product chrome')
    ctx.inject(['uiConversation'], function (scope) {
      scope.uiConversation.events.register(oputeVmInventoryDefinition)
      scope.uiConversation.events.register(oputeAssembleTraceDefinition)
    })

    // ConversationRoot always calls useWorkspaces. Stock ui-workspace installed
    // that root hook; without it the conversation slot throws and the center
    // column stays empty. We keep ui-workspace disabled (folder chrome) and
    // publish the same hook from the implicit seeded workspace.
    ctx.slots.provideRoot({ hooks: { workspaces: workspaces.list } })

    ctx.slots.inject('sidebar.brand.mark', function () {
      return ctx.slots.inject('sidebar.brand.name', function () {
        return ctx.slots.inject('conversation.hero.brand.mark', function* () {
          yield ctx.slots.register(
            { name: 'sidebar.brand.mark', priority: OPUTE_BRAND_PRIORITY },
            OputeBrandMark,
          )
          yield ctx.slots.register(
            { name: 'sidebar.brand.name', priority: OPUTE_BRAND_PRIORITY },
            OputeBrandName,
          )
          yield ctx.slots.register(
            { name: 'conversation.hero.brand.mark', priority: OPUTE_BRAND_PRIORITY },
            OputeBrandMark,
          )
        })
      })
    })

    ctx.slots.inject('settings.onboarding', function () {
      return ctx.slots.register(
        { name: 'settings.onboarding', id: 'welcome-notice', priority: OPUTE_BRAND_PRIORITY },
        SkipDshOnboarding,
      )
    })
    ctx.slots.inject('settings.onboarding', function () {
      return ctx.slots.register(
        { name: 'settings.onboarding', id: 'deepseek-official', priority: OPUTE_BRAND_PRIORITY },
        SkipDshOnboarding,
      )
    })

    ctx.slots.inject('sidebar.workspaces', function () {
      return ctx.slots.register(
        { name: 'sidebar.workspaces' },
        function SessionRailBound(slotProps) {
          return React.createElement(OputeSessionRail, {
            sessions: sessions,
            uiWorkspace: uiWorkspace,
            wide: slotProps && slotProps.wide,
          })
        },
      )
    })

    ctx.slots.inject('conversation.hero.workspace', function () {
      return ctx.slots.register(
        { name: 'conversation.hero.workspace' },
        function OputeHeroWorkspace() {
          return null
        },
      )
    })

    ctx.slots.inject('conversation.session.header.utilities', function () {
      return ctx.slots.register(
        { name: 'conversation.session.header.utilities', id: 'opute-execution-trace' },
        OputeExecutionTrace,
      )
    })

    ctx.slots.inject('conversation.chat.turnTail', function () {
      return ctx.slots.register(
        { name: 'conversation.chat.turnTail', select: selectOputeVmInventory },
        OputeVmTurnTail,
      )
    })

    ctx.slots.inject('tool.call.toolview', function* () {
      for (var i = 0; i < INVENTORY_SLOT_KEYS.length; i++) {
        yield ctx.slots.register(
          { name: 'tool.call.toolview', key: INVENTORY_SLOT_KEYS[i] },
          OputeInventoryCard,
        )
      }
    })

    // Settings → Plugins card. settingsScope is provided by ui-settings; wait
    // for it rather than hard-injecting so this plugin still boots if the
    // settings shell is absent.
    ctx.inject(['settingsScope'], function (sctx) {
      var scope = sctx.settingsScope.bind({ namespace: OPUTE_INSTRUCTIONS_NS })
      sctx.slots.inject('settings.plugin.item', function () {
        return sctx.slots.register(
          { name: 'settings.plugin.item', key: OPUTE_INSTRUCTIONS_NS },
          function OputeInstructionsCardBound() {
            return React.createElement(OputeInstructionsCard, { scope: scope })
          },
        )
      })
    })
  }

  return module.exports
} })
