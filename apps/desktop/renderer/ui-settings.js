'use strict'

const $ = (id) => document.getElementById(id)
const colorIds = ['color-workspace', 'color-add', 'color-sessions', 'color-accent', 'color-ground', 'color-light-ground']

function fill(data) {
  const colors = data?.zones?.colors || {}
  $('color-workspace').value = colors.workspace || '#33A6B8'
  $('color-add').value = colors.addFolder || '#FFB11B'
  $('color-sessions').value = colors.sessions || '#86A697'
  $('color-accent').value = colors.accent || '#CB1B45'
  $('color-ground').value = data?.theme?.colors?.ground || '#0B1013'
  $('color-light-ground').value = data?.theme?.lightColors?.ground || '#F6F4EF'
  const appearance = data?.theme?.appearance || 'light'
  $('appearance').value = appearance
  applyAppearance(appearance)
  $('label-add').value = data?.zones?.labels?.addFolder || ''
  $('label-sessions').value = data?.zones?.labels?.sessions || ''
  $('image-preset').value = data?.theme?.imagePreset || 'selective'
  $('autostart').checked = Boolean(data?.autostart)
}

async function load() {
  try {
    fill(await window.dshUiSettings.get())
    $('status').textContent = ''
  } catch (error) {
    $('status').textContent = `读取失败：${error?.message || error}`
  }
}

async function save() {
  const button = $('save')
  button.disabled = true
  $('status').textContent = '保存中…'
  try {
    const patch = {
      zones: {
        colors: {
          workspace: $('color-workspace').value,
          addFolder: $('color-add').value,
          sessions: $('color-sessions').value,
          accent: $('color-accent').value,
        },
        labels: {
          addFolder: $('label-add').value.trim(),
          sessions: $('label-sessions').value.trim(),
        },
      },
      theme: {
        appearance: $('appearance').value,
        colors: { ground: $('color-ground').value },
        lightColors: { ground: $('color-light-ground').value },
        imagePreset: $('image-preset').value,
      },
    }
    const result = await window.dshUiSettings.save(patch)
    if (!result?.ok) throw new Error(result?.error || '保存失败')
    const auto = await window.dshUiSettings.setAutostart($('autostart').checked)
    if (!auto?.ok) throw new Error(auto?.error || '开机自启动设置失败')
    $('status').textContent = '已保存，主界面会重新加载。'
  } catch (error) {
    $('status').textContent = `保存失败：${error?.message || error}`
  } finally {
    button.disabled = false
  }
}

/** Mirror the selected appearance onto this window so the preview matches the app. */
function applyAppearance(value) {
  const dark = value === 'dark' || (value === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.body.classList.toggle('light', !dark)
}

$('appearance').addEventListener('change', () => { applyAppearance($('appearance').value) })
$('save').addEventListener('click', () => { void save() })
$('close').addEventListener('click', () => { void window.dshUiSettings.close() })
for (const id of colorIds) $(id).addEventListener('input', () => { $('status').textContent = '' })
void load()
