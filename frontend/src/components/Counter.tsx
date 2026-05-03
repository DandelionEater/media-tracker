declare global {
  interface Window {
    require: any
  }
}

import { useEffect, useState } from "react"

export default function Counter() {
  const [episodes, setEpisodes] = useState(0)

  useEffect(() => {
  const { ipcRenderer } = window.require('electron')

  ipcRenderer.invoke('get-episodes').then(setEpisodes)
}, [])

  const increment = async () => {
    const newValue = episodes + 1
    setEpisodes(newValue)

    await window.require('electron').ipcRenderer
      .invoke('set-episodes', newValue)
  }

  return (
    <>
      <div>Episodes: {episodes}</div>

      <button
        onClick={increment}
        className="bg-white text-black px-4 py-2 rounded-lg"
      >
        +1 Episode
      </button>
    </>
  )
}