/** The id of the tab button for a TabSpec id. */
export const tabId = (id: string): string => `tab-${id}`;

/** The id of the panel for a TabSpec id. */
export const tabPanelId = (id: string): string => `panel-${id}`;

/** The attributes of the panel a tab controls; every panel stays mounted, so what was typed in one survives a look at another. */
export const tabPanelProps = (id: string, selected: boolean) => ({
    role: 'tabpanel',
    id: tabPanelId(id),
    'aria-labelledby': tabId(id),
    hidden: !selected,
}) as const;
