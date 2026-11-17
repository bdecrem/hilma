import { render } from 'solid-js/web'
import { Gate } from './components/Gate.tsx'
import './styles/tokens.css'
import './styles/app.css'
import './styles/open.css'

render(() => <Gate />, document.getElementById('root')!)
