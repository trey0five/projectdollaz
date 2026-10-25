// FileDropZone — the shared "drop a file here, or choose one" box (Academics,
// the network results upload, the Knowledge library).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import FileDropZone from './FileDropZone.jsx'
import { KNOWLEDGE_ACCEPT } from '../../pages/KnowledgePage.jsx'

afterEach(cleanup)

const drop = (el, ...files) => fireEvent.drop(el, { dataTransfer: { types: ['Files'], files } })

function zone(props = {}) {
  const onFiles = vi.fn()
  render(<FileDropZone testId="z" title="Drop a file here, or choose one" ariaLabel="Pick" onFiles={onFiles} {...props} />)
  return { onFiles, box: screen.getByTestId('z'), input: screen.getByLabelText('Pick') }
}

describe('FileDropZone', () => {
  it('keeps its title while a file is over it; the button carries the release cue', () => {
    const { box } = zone()
    fireEvent.dragEnter(box, { dataTransfer: { types: ['Files'], files: [] } })
    expect(box.getAttribute('data-over')).toBe('true')
    expect(screen.getByText('Drop a file here, or choose one')).toBeTruthy()
    expect(screen.getByText('Release to add it')).toBeTruthy()
  })

  it('empties the input after a choice, so re-choosing the same file is a real change', () => {
    const { onFiles, input } = zone()
    const f = new File(['a'], 'a.csv', { type: 'text/csv' })
    fireEvent.change(input, { target: { files: [f] } })
    expect(onFiles).toHaveBeenCalledWith([f])
    expect(input.value).toBe('')
  })

  it('while busy it takes neither a drop nor a click', () => {
    const { onFiles, box, input } = zone({ busy: true })
    drop(box, new File(['a'], 'a.csv'))
    expect(onFiles).not.toHaveBeenCalled()
    expect(input.disabled).toBe(true)
    expect(box.getAttribute('data-drop-zone')).toBeNull()
  })
})

describe('the Knowledge upload takes what the server takes', () => {
  it('a Word document, a PowerPoint and a WebP image are accepted', () => {
    const { onFiles, box } = zone({ accept: KNOWLEDGE_ACCEPT })
    for (const name of ['minutes.docx', 'deck.pptx', 'photo.webp', 'notes.txt']) {
      drop(box, new File(['x'], name))
    }
    expect(onFiles).toHaveBeenCalledTimes(4)
  })

  it('an iPhone .heic photo or a .zip is refused before upload, in words', () => {
    const { onFiles, box } = zone({ accept: KNOWLEDGE_ACCEPT, acceptLabel: 'PDF, Word, Excel' })
    drop(box, new File(['x'], 'IMG_0001.heic', { type: 'image/heic' }))
    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s an image — this takes PDF, Word, Excel.')
    drop(box, new File(['x'], 'bundle.zip', { type: 'application/zip' }))
    expect(onFiles).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe('That’s a ZIP file — this takes PDF, Word, Excel.')
  })
})
