import { world, Player, system, MolangVariableMap } from "@minecraft/server"
import { PARTICLE_GROUP, TYPE_IDS } from "./constants"
import { Vector } from "./utils/vector"
import { Particle } from "./utils/particle"

world.afterEvents.itemStartUse.subscribe((data) => {
    const { source, itemStack } = data

    if (itemStack.typeId !== TYPE_IDS.SCALE_ITEM) return

    const ray = source.getBlockFromViewDirection()

    if (!ray) return

    const instance = new EditInstance(data.source, ray.block)
    const location = Vector.add(ray.block.location, ray.faceLocation)

    instance.createEdit(location, ray.face)
})

world.afterEvents.itemReleaseUse.subscribe((data) => {
    const { source, itemStack } = data

    if (itemStack.typeId !== TYPE_IDS.SCALE_ITEM) return

    const instance = EditInstance.get(source.id)

    if (instance) instance.apply()
})

world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
    const instance = EditInstance.get(data.player.id)

    if (instance) instance.remove()
})

world.afterEvents.playerLeave.subscribe((data) => {
    const instance = EditInstance.get(data.playerId)

    if (instance) instance.remove()
})

world.afterEvents.entitySpawn.subscribe((data) => {
    const { entity } = data

    if (!(entity instanceof Player)) return

    const instance = EditInstance.get(entity.id)

    if (instance) instance.remove()
})

class EditInstance {
    static list = {}

    static faceToAxisRotation = {
        Up: { axis: "y", rotation: { x: 0, y: 90 } },
        Down: { axis: "y", rotation: { x: 0, y: 90 } },
        East: { axis: "x", rotation: { x: 0, y: 0 } },
        West: { axis: "x", rotation: { x: 0, y: 0 } },
        South: { axis: "z", rotation: { x: 270, y: 0 } },
        North: { axis: "z", rotation: { x: 270, y: 0 } },
    }

    /** @returns {EditInstance|undefined} */
    static get(id) {
        return this.list[id]
    }

    /**
     * @param {number} id
     * @param {EditInstance} instance
     */
    static add(id, instance) {
        this.list[id] = instance
    }

    /** @returns {EditInstance[]} */
    static getAll() {
        return Object.values(this.list)
    }

    /** @param {number} id */
    static remove(id) {
        this.get(id).remove()
    }

    static runInterval() {
        system.runInterval(() => {
            for (const instance of this.getAll()) {
                instance.run()
            }
        })
    }

    /**
     * @param {Player} player
     * @param {import("@minecraft/server").Block} block
     */
    constructor(player, block) {
        this.player = player
        this.block = block
        this.id = player.id
        this.permutation = block.permutation
        this.dimension = block.dimension
        this.location = block.location

        EditInstance.add(this.id, this)
    }

    run() {
        const { minLocation, maxLocation } = this.getStartEnd()
        const size = Vector.subtract(maxLocation, minLocation)

        if (system.currentTick % 4 === 0) {
            let color

            if (this.player.customIsShifting) {
                color = { red: 1, green: 0.5, blue: 0.5 }
            } else {
                color = { red: 1, green: 1, blue: 1 }
            }

            try {
                spawnParticleBox(this.dimension, minLocation, size, PARTICLE_GROUP.EDIT, color)
            } catch (e) {}
        }

        try {
            Particle.boxEdges(TYPE_IDS.PARTICLE, minLocation, size, this.dimension, 0.1)
        } catch (e) {}

        this.player.onScreenDisplay.setActionBar("§l" + size.stringifyValues())
    }

    getPointer() {
        const inverseRotation = {
            y: (-this.rotation.y * Math.PI) / 180,
            p: (-this.rotation.x * Math.PI) / 180,
            r: 0,
        }
        const relPlayerLocation = Vector.subtract(getEyeLocation(this.player), this.editLocation)
        const nPlayerLocation = Vector.rotate(relPlayerLocation, inverseRotation)
        const nViewDirection = Vector.rotate(this.player.getViewDirection(), inverseRotation)

        const dir = nViewDirection.normalize()
        const t = -nPlayerLocation.x / dir.x

        const hitY = nPlayerLocation.y + t * dir.y
        const hitZ = nPlayerLocation.z + t * dir.z

        switch (this.axis) {
            case "x":
                return new Vector(0, hitY, hitZ)
            case "y":
                return new Vector(hitY, 0, hitZ)
            case "z":
                return new Vector(hitZ, hitY, 0)
        }
    }

    createEdit(location, face) {
        const { axis, rotation } = EditInstance.faceToAxisRotation[face]

        this.editLocation = location

        if (face === "Up" || face === "East" || face === "South") {
            const r = this.editLocation[axis] % 1
            if (r === 0) this.editLocation[axis] += 1
        }

        this.axis = axis
        this.rotation = rotation
    }

    remove() {
        delete EditInstance.list[this.id]
    }

    placeBlocks() {
        const { minLocation, maxLocation } = this.getStartEnd()

        for (let x = minLocation.x; x < maxLocation.x; x++) {
            for (let y = minLocation.y; y < maxLocation.y; y++) {
                for (let z = minLocation.z; z < maxLocation.z; z++) {
                    const location = new Vector(x, y, z)
                    this.dimension.setBlockPermutation(location, this.permutation)
                }
            }
        }
    }

    removeBlocks() {
        const { minLocation, maxLocation } = this.getStartEnd()

        for (let x = minLocation.x; x < maxLocation.x; x++) {
            for (let y = minLocation.y; y < maxLocation.y; y++) {
                for (let z = minLocation.z; z < maxLocation.z; z++) {
                    const location = new Vector(x, y, z)
                    this.dimension.setBlockType(location, "minecraft:air")
                }
            }
        }
    }

    /**
     * @returns {{minLocation:Vector,maxLocation:Vector}}
     */
    getStartEnd() {
        let minLocation = new Vector()
        let maxLocation = new Vector()

        const pointer = this.getPointer().add(this.editLocation)
        const location = new Vector(0.5).add(this.location)

        minLocation.x = Math.min(location.x, pointer.x)
        minLocation.y = Math.min(location.y, pointer.y)
        minLocation.z = Math.min(location.z, pointer.z)

        maxLocation.x = Math.max(location.x, pointer.x)
        maxLocation.y = Math.max(location.y, pointer.y)
        maxLocation.z = Math.max(location.z, pointer.z)

        return {
            minLocation: minLocation.floor(),
            maxLocation: maxLocation.ceil(),
        }
    }

    apply() {
        try {
            if (this.player.customIsShifting) {
                this.removeBlocks()
            } else {
                this.placeBlocks()
            }
        } catch (error) {
            this.player.onScreenDisplay.setActionBar("§l§4Out of Range")
        }
        this.remove()
    }
}

function getEyeLocation(player) {
    const headModelSize = 8
    const headHeight = headModelSize / 32
    const location = player.getHeadLocation()

    location.y += headHeight / 2 - 0.022

    return location
}

function spawnParticleBox(dimension, location, size, particles, rgb) {
    const color = rgb || { red: 1, green: 0, blue: 0 }
    let zFightingOffset = 0.01625

    const getMolang = (xSize, ySize, xOffset = 0, yOffset = 0, zOffset = 0) => {
        const molang = new MolangVariableMap()

        molang.setColorRGB("color", color)
        molang.setFloat("offset_x", xOffset)
        molang.setFloat("offset_y", yOffset)
        molang.setFloat("offset_z", zOffset)

        molang.setFloat("size_x", 0.5 * xSize)
        molang.setFloat("size_y", 0.5 * ySize)
        molang.setFloat("t", 0.5)

        return molang
    }

    dimension.spawnParticle(
        particles[0],
        new Vector(size.x / 2, size.y / 2, -zFightingOffset).add(location),
        getMolang(size.x, size.y),
    )

    dimension.spawnParticle(
        particles[0],
        new Vector(size.x / 2, size.y / 2, zFightingOffset + size.z).add(location),
        getMolang(size.x, size.y),
    )

    dimension.spawnParticle(
        particles[1],
        new Vector(size.x / 2, -zFightingOffset, size.z / 2).add(location),
        getMolang(size.x, size.z),
    )

    dimension.spawnParticle(
        particles[1],
        new Vector(size.x / 2, zFightingOffset + size.y, size.z / 2).add(location),
        getMolang(size.x, size.z),
    )

    dimension.spawnParticle(
        particles[2],
        new Vector(-zFightingOffset, size.y / 2, size.z / 2).add(location),
        getMolang(size.z, size.y),
    )

    dimension.spawnParticle(
        particles[2],
        new Vector(zFightingOffset + size.x, size.y / 2, size.z / 2).add(location),
        getMolang(size.z, size.y),
    )
}

EditInstance.runInterval()
