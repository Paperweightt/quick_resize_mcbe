import { world, Player, system, MolangVariableMap, ItemStack } from "@minecraft/server"
import { PARTICLE_GROUP, TYPE_IDS } from "./constants"
import { Vector } from "./utils/vector"

world.afterEvents.playerPlaceBlock.subscribe((data) => {
    const { player, block } = data
    new EditInstance(player, block)
})

world.afterEvents.itemStartUse.subscribe((data) => {
    const { source, itemStack } = data

    if (itemStack.typeId !== TYPE_IDS.SCALE_ITEM) return

    const instance = EditInstance.get(source.id)

    if (!instance) return

    const ray = source.getBlockFromViewDirection()

    if (!ray) return

    const location = Vector.add(ray.block.location, ray.faceLocation)

    instance.createEdit(location, ray.face)
})

world.afterEvents.itemReleaseUse.subscribe((data) => {
    const { source, itemStack } = data

    if (itemStack.typeId !== TYPE_IDS.SCALE_ITEM) return

    const instance = EditInstance.get(source.id)

    if (!instance) return

    instance.apply()
})

world.afterEvents.playerHotbarSelectedSlotChange.subscribe((data) => {
    const { player } = data

    const instance = EditInstance.get(player.id)

    if (!instance || instance.mode === "highlight") return

    instance.resetPlayer()
    instance.remove()
})

world.afterEvents.playerLeave.subscribe((data) => {
    const { playerId } = data

    const instance = EditInstance.get(playerId)

    if (!instance) return

    instance.remove()
})

world.afterEvents.entitySpawn.subscribe((data) => {
    const { entity } = data

    if (!(entity instanceof Player)) return

    const instance = EditInstance.get(entity.id)

    if (instance) {
        instance.resetPlayer()
        instance.remove()
    } else {
        const container = entity.getComponent("inventory").container

        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i)
            if (item?.typeId === TYPE_IDS.SCALE_ITEM) container.setItem(i, undefined)
        }
    }
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

    /** @returns {EditInstance} */
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
        }, 2)
    }

    /** @type {"highlight"|"edit"} */
    mode = "highlight"

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
        if (this.mode === "highlight") {
            const ray = this.player.getBlockFromViewDirection()

            if (!ray) {
                if (this.playerHasScaleItem()) this.resetPlayer()
                return
            }

            const { block, faceLocation } = ray

            if (Vector.equals(this.location, block)) {
                this.displaySelection()

                // corner check
                // faceLocation.x === 0 &&
                // (faceLocation.y < 0.2 || faceLocation.y > 0.8) &&
                // (faceLocation.z < 0.2 || faceLocation.z > 0.8)

                if (
                    (faceLocation.x === 0 &&
                        (faceLocation.y < 0.3 ||
                            faceLocation.y > 0.7 ||
                            faceLocation.z < 0.3 ||
                            faceLocation.z > 0.7)) ||
                    (faceLocation.y === 0 &&
                        (faceLocation.x < 0.3 ||
                            faceLocation.x > 0.7 ||
                            faceLocation.z < 0.3 ||
                            faceLocation.z > 0.7)) ||
                    (faceLocation.z === 0 &&
                        (faceLocation.x < 0.3 ||
                            faceLocation.x > 0.7 ||
                            faceLocation.y < 0.3 ||
                            faceLocation.y > 0.7))
                ) {
                    if (!this.playerHasScaleItem()) this.givePlayerScaleItem()
                } else if (this.playerHasScaleItem()) this.resetPlayer()
            } else if (this.playerHasScaleItem()) {
                this.resetPlayer()
            }
        } else if (this.mode === "edit") {
            const { minLocation, maxLocation } = this.getStartEnd()

            const size = Vector.subtract(maxLocation, minLocation)

            displayParticles(this.dimension, minLocation, size, PARTICLE_GROUP.EDIT)
        }
    }

    resetPlayer() {
        this.slot.setItem(this.origonalItem)

        delete this.slot
        delete this.origonalItem
    }

    /** @returns {boolean} */
    playerHasScaleItem() {
        if (!this.slot) return false

        return this.slot.getItem()?.typeId === TYPE_IDS.SCALE_ITEM
    }

    givePlayerScaleItem() {
        const container = this.player.getComponent("inventory").container
        const itemStack = new ItemStack(TYPE_IDS.SCALE_ITEM)
        this.slot = container.getSlot(this.player.selectedSlotIndex)
        this.origonalItem = this.slot.getItem()

        this.slot.setItem(itemStack)
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

        this.mode = "edit"
        this.editLocation = location
        this.axis = axis
        this.rotation = rotation
    }

    displaySelection() {
        displayParticles(this.dimension, this.location, new Vector(1), PARTICLE_GROUP.HOVER)
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

    getStartEnd() {
        let minLocation = new Vector()
        let maxLocation = new Vector()

        const pointer = this.getPointer().add(this.editLocation)
        const location = new Vector(0.5).add(this.location)

        location[this.axis] -= 0.5

        minLocation.x = Math.min(location.x, pointer.x)
        minLocation.y = Math.min(location.y, pointer.y)
        minLocation.z = Math.min(location.z, pointer.z)

        maxLocation.x = Math.max(location.x, pointer.x)
        maxLocation.y = Math.max(location.y, pointer.y)
        maxLocation.z = Math.max(location.z, pointer.z)

        maxLocation[this.axis]++

        return {
            minLocation: minLocation.floor(),
            maxLocation: maxLocation.ceil(),
        }
    }

    apply() {
        this.placeBlocks()
        this.resetPlayer()
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

function displayParticles(dimension, location, size, particles) {
    const color = { red: 0.5, green: 0.5, blue: 0.5 }

    const getMolang = (xSize, ySize, xOffset = 0, yOffset = 0, zOffset = 0) => {
        const molang = new MolangVariableMap()

        molang.setColorRGB("color", color)
        molang.setFloat("offset_x", xOffset)
        molang.setFloat("offset_y", yOffset)
        molang.setFloat("offset_z", zOffset)

        molang.setFloat("size_x", 0.5 * xSize)
        molang.setFloat("size_y", 0.5 * ySize)

        return molang
    }

    dimension.spawnParticle(
        particles[0],
        new Vector(size.x / 2, size.y / 2, -0.001).add(location),
        getMolang(size.x, size.y),
    )

    dimension.spawnParticle(
        particles[0],
        new Vector(size.x / 2, size.y / 2, 0.001 + size.z).add(location),
        getMolang(size.x, size.y),
    )

    dimension.spawnParticle(
        particles[1],
        new Vector(size.x / 2, -0.001, size.z / 2).add(location),
        getMolang(size.x, size.z),
    )

    dimension.spawnParticle(
        particles[1],
        new Vector(size.x / 2, 0.001 + size.y, size.z / 2).add(location),
        getMolang(size.x, size.z),
    )

    dimension.spawnParticle(
        particles[2],
        new Vector(-0.001, size.y / 2, size.z / 2).add(location),
        getMolang(size.z, size.y),
    )

    dimension.spawnParticle(
        particles[2],
        new Vector(0.001 + size.x, size.y / 2, size.z / 2).add(location),
        getMolang(size.z, size.y),
    )
}

EditInstance.runInterval()
