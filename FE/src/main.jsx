import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@fontsource-variable/nunito'
import '@fontsource-variable/baloo-2'
import './styles.css'

// Page translation (Google Translate in Chrome / Edge) replaces the text React rendered with its own <font> nodes.
// When React later removes or moves that text it no longer finds it where it put it, throws "Failed to execute
// 'removeChild' on 'Node'", and the whole page goes blank. A node that has already been moved away is left alone.
if (typeof Node === 'function' && Node.prototype) {
  const removeChild = Node.prototype.removeChild
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child
    return removeChild.call(this, child)
  }
  const insertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function (node, reference) {
    if (reference && reference.parentNode !== this) return insertBefore.call(this, node, null)
    return insertBefore.call(this, node, reference)
  }
}

// Any other error while rendering shows a message with a way back instead of a blank page.
class ErrorBoundary extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" style={{ maxWidth: 520, margin: '80px auto', padding: 24, textAlign: 'center' }}>
        <h2>Something went wrong on this page.</h2>
        <p className="muted">Your saved work is safe. Reload the page to continue.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
