const config = {
  logo: <span>DayDay ERP Help Center</span>,
  project: {
    link: 'https://dayday.az'
  },
  docsRepositoryBase: 'https://github.com/dayday-erp/dayday_erp/tree/main/apps/docs',
  footer: {
    text: `DayDay ERP Help Center ${new Date().getFullYear()}`
  },
  useNextSeoProps() {
    return {
      titleTemplate: '%s - DayDay ERP Help Center'
    }
  },
  head: (
    <>
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <meta name="description" content="User documentation for DayDay ERP" />
      <meta name="og:title" content="DayDay ERP Help Center" />
    </>
  )
}

export default config
