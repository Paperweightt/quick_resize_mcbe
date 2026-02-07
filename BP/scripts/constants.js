export const PACK_ID = "qsc"

export const TYPE_IDS = {
    SCALE_ITEM: PACK_ID + ":resizer",
    PARTICLE: PACK_ID + ":line",
}

export const PARTICLE_GROUP = {
    HOVER: [
        PACK_ID + ":highlight_axis_x",
        PACK_ID + ":highlight_axis_y",
        PACK_ID + ":highlight_axis_z",
    ],
    EDIT: [
        PACK_ID + ":selection_axis_x",
        PACK_ID + ":selection_axis_y",
        PACK_ID + ":selection_axis_z",
    ],
}
