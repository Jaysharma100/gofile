import Head from 'next/head'
import FileTransfer from '../components/FileTransfer.js'

export default function Home() {
  return (
    <div className="app-container">
      <Head>
        <title>P2P File Transfer</title>
        <meta name="description" content="Peer-to-peer file transfer using WebRTC" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="main-content">
        <FileTransfer />
      </main>
    </div>
  )
}