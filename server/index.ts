import app from './app'
const port = Number(process.env.PORT || 3001)
app.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Orion server ready on port ${port}`),
)
