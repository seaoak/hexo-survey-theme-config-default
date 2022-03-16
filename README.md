# hexo-survey-theme-config-default

A simple tool to survey default `_config.yml` of Hexo themes.

- Hexo   
  https://hexo.io
- Themes | Hexo   
  https://hexo.io/themes/

This tool is intended to make my own view for whether "deepmerge" is useful for configs of Hexo Theme.

Related Issues/PRs:

- fix(theme): deep merge configs by curbengh ・ Pull Request #3967 ・ hexojs/hexo   
  https://github.com/hexojs/hexo/pull/3967
- feat: disable deep merging theme configs by default by curbengh ・ Pull Request #4154 ・ hexojs/hexo   
  https://github.com/hexojs/hexo/pull/4154
- Allow overriding landscape theme sidebar config by rayfoss ・ Pull Request #4723 ・ hexojs/hexo   
  https://github.com/hexojs/hexo/pull/4723

Related Issue in "Landscape" theme (the default theme of Hexo):

- Override the theme settings ・ Issue #102 ・ hexojs/hexo-theme-landscape   
  https://github.com/hexojs/hexo-theme-landscape/issues/102

## How it works

 1. Fetch HTML file of the Hexo theme catalog page   
    https://hexo.io/themes/
 2. Parse HTML and extract URL of GitHub repository for each theme
 3. Fetch HTML file of GitHub repository for each theme
 4. Parse HTML and extract URL of default config file `_config.yml`
 5. Fetch `_config.yml` from GitHub
 6. Parse YAML file and convert to JavaScript object
 7. Check the object whtether it has wrong properties
 8. Summarize totals and output as a table

## How to use

```
git clone https://github.com/seaoak/hexo-survey-theme-config-default.git
cd hexo-survey-theme-config-default
npm install
npm run run
```

Maybe use `2>&1 | tee z` because many logs are outputted to stdout.

Last of the log will be as follows:

```
354 themes are found in catalog
352 themes are found in GitHub
311 themes have default config file
311 themes are downloaded from GitHub
299 themes are processing for analysis
┌─────────┬───────────────────────────┬──────────┬─────────┬─────────┐
│ (index) │           label           │ violated │ checked │  ratio  │
├─────────┼───────────────────────────┼──────────┼─────────┼─────────┤
│    0    │  'menu_should_be_empty'   │   199    │   299   │ '66.6%' │
│    1    │   'nav_should_be_empty'   │    16    │   299   │ '5.4%'  │
│    2    │ 'widgets_should_be_empty' │    57    │   299   │ '19.1%' │
│    3    │  'links_should_be_empty'  │    29    │   299   │ '9.7%'  │
└─────────┴───────────────────────────┴──────────┴─────────┴─────────┘
CACHE: 680 entries are saved to ./cache.json
Completed
```

## So what?

This tool shows that there are many themes that default config file contains default values for `menu` or `widgets`.
These default values might be intended to be replaced with user's theme config.
But using `deepmerge` makes it impossible.
I think `deepmerge` should be able to disable by user's config file.
